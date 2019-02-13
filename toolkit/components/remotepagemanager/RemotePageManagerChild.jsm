/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

var EXPORTED_SYMBOLS = ["ChildMessagePort"];

const { Services } = ChromeUtils.import("resource://gre/modules/Services.jsm");
const { MessagePort, RPMAccessMap } = ChromeUtils.import(
  "resource://gre/modules/remotepagemanager/MessagePort.jsm"
);

ChromeUtils.defineModuleGetter(
  this,
  "AsyncPrefs",
  "resource://gre/modules/AsyncPrefs.jsm"
);
ChromeUtils.defineModuleGetter(
  this,
  "PrivateBrowsingUtils",
  "resource://gre/modules/PrivateBrowsingUtils.jsm"
);
ChromeUtils.defineModuleGetter(
  this,
  "UpdateUtils",
  "resource://gre/modules/UpdateUtils.jsm"
);

/**
 * Defines a set of capabilities that can be exposed to content pages. Each
 * property of the object is a capability. Each capability is an object with an
 * "execute" function or a remote property. The execute function is called to
 * execute the capability in the child process. When run "this" will be the
 * message port. When the capability has a remote property the request to run
 * the capability is sent to the parent process, a Promise is returned that
 * completes with the result. Optionally capabilities can include a "validate"
 * function which is called with the access filter for the current caller and
 * the arguments to be passed to execute, it should return true to allow the
 * call to proceed.
 */
const RPMChildCapabilities = {
  RPMGetAppBuildID: {
    execute() {
      return Services.appinfo.appBuildID;
    },
  },

  RPMGetIntPref: {
    validate: (aAccess, aPref) => aAccess.includes(aPref),
    execute(aPref) {
      return Services.prefs.getIntPref(aPref);
    },
  },

  RPMGetStringPref: {
    validate: (aAccess, aPref) => aAccess.includes(aPref),
    execute(aPref) {
      return Services.prefs.getStringPref(aPref);
    },
  },

  RPMGetBoolPref: {
    validate: (aAccess, aPref) => aAccess.includes(aPref),
    execute(aPref) {
      return Services.prefs.getBoolPref(aPref);
    },
  },

  RPMSetBoolPref: {
    // For now AsyncPrefs is resonsible for limiting the prefs that can be set.
    validate: () => true,
    execute: (aPref, aValue) => {
      return AsyncPrefs.set(aPref, aValue);
    },
  },

  RPMGetFormatURLPref: {
    validate: (aAccess, aFormatURL) => aAccess.includes(aFormatURL),
    execute(aFormatURL) {
      return Services.urlFormatter.formatURLPref(aFormatURL);
    },
  },

  RPMIsWindowPrivate: {
    execute() {
      return PrivateBrowsingUtils.isContentWindowPrivate(this.window);
    },
  },

  RPMGetUpdateChannel: {
    execute() {
      return UpdateUtils.UpdateChannel;
    },
  },

  RPMGetFxAccountsEndpoint: {
    remote: true,
  },

  RPMRecordTelemetryEvent: {
    execute(category, event, object, value, extra) {
      return Services.telemetry.recordEvent(
        category,
        event,
        object,
        value,
        extra
      );
    },
  },

  RPMAddToHistogram: {
    execute(histID, bin) {
      Services.telemetry.getHistogramById(histID).add(bin);
    },
  }
};

// Called to return the capabilities that a principal has access to.
function getCapabilities(aPrincipal) {
  // if there is no content principal; deny access to everything.
  if (!aPrincipal || !aPrincipal.URI) {
    return [];
  }
  let uri = aPrincipal.URI.asciiSpec;

  if (!(uri in RPMAccessMap)) {
    return [];
  }

  let capabilities = [];
  for (let name of Object.keys(RPMAccessMap[uri])) {
    if (name in RPMChildCapabilities) {
      capabilities.push(name);
    } else {
      Cu.reportError(`Capability allowed for '${uri}' does not exist.`);
    }
  }

  return capabilities;
}

function performChildCapability(aPrincipal, aCapability, aPort, aArgs) {
  // if there is no content principal; deny access
  if (!aPrincipal || !aPrincipal.URI) {
    throw new Error(`Access to ${aCapability} is not allowed for this page.`);
  }
  let uri = aPrincipal.URI.asciiSpec;

  if (!(uri in RPMAccessMap)) {
    throw new Error(`Access to ${aCapability} is denied for ${uri}`);
  }

  if (!(aCapability in RPMAccessMap[uri])) {
    throw new Error(`Access to ${aCapability} is denied for ${uri}`);
  }

  if (!(aCapability in RPMChildCapabilities)) {
    throw new Error(`Access to ${aCapability} is denied for ${uri}`);
  }

  let filter = RPMAccessMap[uri][aCapability];
  let capability = RPMChildCapabilities[aCapability];

  let allowed = !!filter;
  if ("validate" in capability) {
    allowed = capability.validate(filter, ...aArgs);
  }

  if (!allowed) {
    throw new Error(`Access to ${aCapability} is denied for ${uri}`);
  }

  if (capability.remote) {
    return aPort.sendRequest("callCapability", [aCapability, aArgs]);
  }

  return capability.execute.apply(aPort, aArgs);
}

// The content side of a message port
class ChildMessagePort extends MessagePort {
  constructor(actor, window) {
    let portID =
      Services.appinfo.processID + ":" + ChildMessagePort.nextPortID++;
    super(actor, portID);

    this.window = window;

    // Maintained for pages not switched to capabilities.
    Cu.exportFunction(this.sendAsyncMessage.bind(this), window, {
      defineAs: "RPMSendAsyncMessage",
    });
    Cu.exportFunction(this.addMessageListener.bind(this), window, {
      defineAs: "RPMAddMessageListener",
      allowCallbacks: true,
    });
    Cu.exportFunction(this.removeMessageListener.bind(this), window, {
      defineAs: "RPMRemoveMessageListener",
      allowCallbacks: true,
    });

    let principal = window.document.nodePrincipal;
    let capabilities = getCapabilities(principal);

    capabilities.forEach(capability => {
      Cu.exportFunction(
        (...aArgs) => {
          let result = performChildCapability(
            principal,
            capability,
            this,
            aArgs
          );

          const clone = obj => {
            return Cu.cloneInto(obj, window);
          };

          // If the result was a promise then wrap it in a promise the content
          // can access.
          if (result && typeof result == "object" && "then" in result) {
            return new window.Promise((resolve, reject) => {
              result.then(
                obj => resolve(clone(obj)),
                obj => reject(clone(obj))
              );
            });
          }

          return clone(result);
        },
        window,
        { defineAs: capability }
      );
    });
    Cu.exportFunction(this.addToHistogram.bind(this), window, {
      defineAs: "RPMAddToHistogram",
    });

    // The actor form only needs the functions set up above. The actor
    // will send and receive messages directly.
    if (!(this.messageManager instanceof Ci.nsIMessageSender)) {
      return;
    }

    // Send a message for load events
    let loadListener = () => {
      this.sendAsyncMessage("RemotePage:Load");
      window.removeEventListener("load", loadListener);
    };
    window.addEventListener("load", loadListener);

    // Destroy the port when the window is unloaded
    window.addEventListener("unload", () => {
      try {
        this.sendAsyncMessage("RemotePage:Unload");
      } catch (e) {
        // If the tab has been closed the frame message manager has already been
        // destroyed
      }
      this.destroy();
    });

    // Tell the main process to set up its side of the message pipe.
    this.messageManager.sendAsyncMessage("RemotePage:InitPort", {
      portID,
      url: window.document.documentURI.replace(/[\#|\?].*$/, ""),
    });
  }

  // Called when the content process is requesting some data.
  async handleRequest(name, data) {
    throw new Error(`Unknown request ${name}.`);
  }

  // Called when a message is received from the message manager or actor.
  handleMessage(messagedata) {
    let message = {
      name: messagedata.name,
      data: messagedata.data,
    };
    this.listener.callListeners(Cu.cloneInto(message, this.window));
  }

  destroy() {
    this.window = null;
    super.destroy.call(this);
  }
}

ChildMessagePort.nextPortID = 0;
