/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* eslint-env mozilla/frame-script */

var { Services } = ChromeUtils.import("resource://gre/modules/Services.jsm");
ChromeUtils.defineModuleGetter(
  this,
  "PWAService",
  Services.appinfo.processType == Services.appinfo.PROCESS_TYPE_DEFAULT
    ? "resource:///modules/PWAService.jsm"
    : "resource:///modules/PWAServiceChild.jsm"
);
/* global PWAService */

const PWAHandler = {
  _pwa: null,

  init() {
    let results = sendSyncMessage("PWA:GetId");
    if (results.length != 1) {
      console.error(`Received ${results.length} results for PWA:GetId`);
    }

    this._pwa = PWAService.get(results[0]);

    if (Services.appinfo.processType != Services.appinfo.PROCESS_TYPE_DEFAULT) {
      let tabchild = docShell
        .QueryInterface(Ci.nsIInterfaceRequestor)
        .getInterface(Ci.nsIBrowserChild);
      tabchild.webBrowserChrome = this;
    }

    docShell.loadURIDelegate = this;
  },

  onBeforeLinkTraversal(originalTarget, uri, linkNode, isAppTab) {
    return PWAService.onBeforeLinkTraversal(
      this._pwa,
      originalTarget,
      uri,
      linkNode,
      isAppTab
    );
  },

  shouldLoadURI(
    docShell,
    uri,
    referrer,
    hasPostData,
    triggeringPrincipal,
    csp
  ) {
    return PWAService.shouldLoadURI(
      this._pwa,
      docShell,
      uri,
      referrer,
      hasPostData,
      triggeringPrincipal,
      csp
    );
  },

  shouldLoadURIInThisProcess(uri) {
    return true;
  },

  // Try to reload the currently active or currently loading page in a new process.
  reloadInFreshProcess(
    docShell,
    uri,
    referrer,
    triggeringPrincipal,
    loadFlags,
    csp
  ) {
    return false;
  },

  onBeforeOpenWindow(
    parent,
    uriToLoad,
    name,
    features,
    args,
    calledFromJS,
    isPopupSpam
  ) {
    return PWAService.onBeforeOpenWindow(
      this._pwa,
      parent,
      uriToLoad,
      name,
      features,
      args,
      calledFromJS,
      isPopupSpam
    );
  },

  loadURI(uri, where, flags, triggeringPrincipal) {
    return PWAService.loadURI(
      this._pwa,
      uri,
      where,
      flags,
      triggeringPrincipal
    );
  },

  handleLoadError(uri, error, errorModule) {
    return null;
  },
};

PWAHandler.init();
