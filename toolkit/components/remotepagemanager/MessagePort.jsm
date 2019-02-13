/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

var EXPORTED_SYMBOLS = ["MessagePort", "MessageListener", "RPMAccessMap"];

ChromeUtils.defineModuleGetter(
  this,
  "PromiseUtils",
  "resource://gre/modules/PromiseUtils.jsm"
);

/*
 * Used for all kinds of permissions checks which requires explicit
 * whitelisting of specific permissions granted through RPM.
 *
 * Please note that prefs that one wants to update need to be
 * whitelisted within AsyncPrefs.jsm.
 */
let RPMAccessMap = {
  "about:certerror": {
    RPMGetFormatURLPref: ["app.support.baseURL"],
    RPMGetBoolPref: [
      "security.certerrors.mitm.priming.enabled",
      "security.certerrors.permanentOverride",
      "security.enterprise_roots.auto-enabled",
      "security.certerror.hideAddException",
      "security.ssl.errorReporting.automatic",
      "security.ssl.errorReporting.enabled",
    ],
    RPMSetBoolPref: [
      "security.ssl.errorReporting.automatic",
    ],
    RPMGetIntPref: [
      "services.settings.clock_skew_seconds",
      "services.settings.last_update_seconds",
    ],
    RPMGetAppBuildID: true,
    RPMAddToHistogram: true,
    RPMIsWindowPrivate: true,
    RPMRecordTelemetryEvent: true,
  },
  "about:neterror": {
    RPMGetFormatURLPref: ["app.support.baseURL"],
    RPMGetBoolPref: [
      "security.certerror.hideAddException",
      "security.ssl.errorReporting.automatic",
      "security.ssl.errorReporting.enabled",
      "security.tls.version.enable-deprecated",
      "security.certerrors.tls.version.show-override",
    ],
    RPMSetBoolPref: [
      "security.ssl.errorReporting.automatic"
    ],
    RPMAddToHistogram: true,
  },
  "about:privatebrowsing": {
    // "sendAsyncMessage": handled within AboutPrivateBrowsingHandler.jsm
    RPMGetFormatURLPref: ["app.support.baseURL"],
    RPMIsWindowPrivate: true,
  },
  "about:protections": {
    RPMGetBoolPref: [
      "browser.contentblocking.report.lockwise.enabled",
      "browser.contentblocking.report.monitor.enabled",
      "privacy.socialtracking.block_cookies.enabled",
      "browser.contentblocking.report.proxy.enabled",
      "privacy.trackingprotection.cryptomining.enabled",
      "privacy.trackingprotection.fingerprinting.enabled",
      "privacy.trackingprotection.enabled",
      "privacy.trackingprotection.socialtracking.enabled",
    ],
    RPMGetStringPref: [
      "browser.contentblocking.category",
      "browser.contentblocking.report.lockwise.url",
      "browser.contentblocking.report.monitor.url",
      "browser.contentblocking.report.monitor.sign_in_url",
      "browser.contentblocking.report.manage_devices.url",
      "browser.contentblocking.report.proxy_extension.url",
    ],
    RPMGetIntPref: [
      "network.cookie.cookieBehavior"
    ],
    RPMGetFormatURLPref: [
      "browser.contentblocking.report.monitor.how_it_works.url",
      "browser.contentblocking.report.lockwise.how_it_works.url",
      "browser.contentblocking.report.social.url",
      "browser.contentblocking.report.cookie.url",
      "browser.contentblocking.report.tracker.url",
      "browser.contentblocking.report.fingerprinter.url",
      "browser.contentblocking.report.cryptominer.url",
    ],
    RPMRecordTelemetryEvent: true,
  },
  "about:newinstall": {
    RPMGetUpdateChannel: true,
    RPMGetFxAccountsEndpoint: true,
  },
};

class MessageListener {
  constructor() {
    this.listeners = new Map();
  }

  keys() {
    return this.listeners.keys();
  }

  has(name) {
    return this.listeners.has(name);
  }

  callListeners(message) {
    let listeners = this.listeners.get(message.name);
    if (!listeners) {
      return;
    }

    for (let listener of listeners.values()) {
      try {
        listener(message);
      } catch (e) {
        Cu.reportError(e);
      }
    }
  }

  addMessageListener(name, callback) {
    if (!this.listeners.has(name)) {
      this.listeners.set(name, new Set([callback]));
    } else {
      this.listeners.get(name).add(callback);
    }
  }

  removeMessageListener(name, callback) {
    if (!this.listeners.has(name)) {
      return;
    }

    this.listeners.get(name).delete(callback);
  }
}

/*
 * A message port sits on each side of the process boundary for every remote
 * page. Each has a port ID that is unique to the message manager it talks
 * through.
 *
 * We roughly implement the same contract as nsIMessageSender and
 * nsIMessageListenerManager
 */
class MessagePort {
  constructor(messageManagerOrActor, portID) {
    this.messageManager = messageManagerOrActor;
    this.portID = portID;
    this.destroyed = false;
    this.listener = new MessageListener();

    // This is a sparse array of pending requests. The id of each request is
    // simply its index in the array. The next id is the current length of the
    // array (which includes the count of missing indexes).
    this.requests = [];

    this.message = this.message.bind(this);
    this.receiveRequest = this.receiveRequest.bind(this);
    this.receiveResponse = this.receiveResponse.bind(this);
    this.addMessageListeners();
  }

  addMessageListeners() {
    if (!(this.messageManager instanceof Ci.nsIMessageSender)) {
      return;
    }

    this.messageManager.addMessageListener("RemotePage:Message", this.message);
    this.messageManager.addMessageListener(
      "RemotePage:Request",
      this.receiveRequest
    );
    this.messageManager.addMessageListener(
      "RemotePage:Response",
      this.receiveResponse
    );
  }

  removeMessageListeners() {
    if (!(this.messageManager instanceof Ci.nsIMessageSender)) {
      return;
    }

    this.messageManager.removeMessageListener(
      "RemotePage:Message",
      this.message
    );
    this.messageManager.removeMessageListener(
      "RemotePage:Request",
      this.receiveRequest
    );
    this.messageManager.removeMessageListener(
      "RemotePage:Response",
      this.receiveResponse
    );
  }

  // Called when the message manager used to connect to the other process has
  // changed, i.e. when a tab is detached.
  swapMessageManager(messageManager) {
    this.removeMessageListeners();
    this.messageManager = messageManager;
    this.addMessageListeners();
  }

  // Sends a request to the other process and returns a promise that completes
  // once the other process has responded to the request or some error occurs.
  sendRequest(name, args) {
    if (this.destroyed) {
      return this.window.Promise.reject(
        new Error("Message port has been destroyed")
      );
    }

    let deferred = PromiseUtils.defer();
    this.requests.push(deferred);

    this.messageManager.sendAsyncMessage("RemotePage:Request", {
      portID: this.portID,
      requestID: this.requests.length - 1,
      name,
      args,
    });

    return deferred.promise;
  }

  // Handles an IPC message to perform a request of some kind.
  async receiveRequest({ data: messagedata }) {
    if (this.destroyed || messagedata.portID != this.portID) {
      return;
    }

    let data = {
      portID: this.portID,
      requestID: messagedata.requestID,
    };

    try {
      data.resolve = await this.handleRequest(
        messagedata.name,
        messagedata.args
      );
    } catch (e) {
      data.reject = "Request failed.";
    }

    this.messageManager.sendAsyncMessage("RemotePage:Response", data);
  }

  // Handles an IPC message with the response of a request.
  receiveResponse({ data: messagedata }) {
    if (this.destroyed || messagedata.portID != this.portID) {
      return;
    }

    let deferred = this.requests[messagedata.requestID];
    if (!deferred) {
      Cu.reportError("Received a response to an unknown request.");
      return;
    }

    delete this.requests[messagedata.requestID];

    if ("resolve" in messagedata) {
      deferred.resolve(messagedata.resolve);
    } else if ("reject" in messagedata) {
      deferred.reject(messagedata.reject);
    } else {
      deferred.reject(new Error("Internal RPM error."));
    }
  }

  // Handles an IPC message containing any message.
  message({ data: messagedata }) {
    if (this.destroyed || messagedata.portID != this.portID) {
      return;
    }

    this.handleMessage(messagedata);
  }

  /* Adds a listener for messages. Many callbacks can be registered for the
   * same message if necessary. An attempt to register the same callback for the
   * same message twice will be ignored. When called the callback is passed an
   * object with these properties:
   *   target: This message port
   *   name:   The message name
   *   data:   Any data sent with the message
   */
  addMessageListener(name, callback) {
    if (this.destroyed) {
      throw new Error("Message port has been destroyed");
    }

    this.listener.addMessageListener(name, callback);
  }

  /*
   * Removes a listener for messages.
   */
  removeMessageListener(name, callback) {
    if (this.destroyed) {
      throw new Error("Message port has been destroyed");
    }

    this.listener.removeMessageListener(name, callback);
  }

  // Sends a message asynchronously to the other process
  sendAsyncMessage(name, data = null) {
    if (this.destroyed) {
      throw new Error("Message port has been destroyed");
    }

    let id;
    if (this.window) {
      id = this.window.docShell.browsingContext.id;
    }
    if (this.messageManager instanceof Ci.nsIMessageSender) {
      this.messageManager.sendAsyncMessage("RemotePage:Message", {
        portID: this.portID,
        browsingContextID: id,
        name,
        data,
      });
    } else {
      this.messageManager.sendAsyncMessage(name, data);
    }
  }

  // Called to destroy this port
  destroy() {
    try {
      // This can fail in the child process if the tab has already been closed
      this.removeMessageListeners();
    } catch (e) {}

    for (let deferred of this.requests) {
      if (deferred) {
        deferred.reject(new Error("Message port has been destroyed"));
      }
    }

    this.messageManager = null;
    this.destroyed = true;
    this.portID = null;
    this.listener = null;
    this.requests = [];
  }
}
