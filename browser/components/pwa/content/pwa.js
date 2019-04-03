/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

ChromeUtils.defineModuleGetter(
  this,
  "Services",
  "resource://gre/modules/Services.jsm"
);
ChromeUtils.defineModuleGetter(
  this,
  "PWAService",
  "resource:///modules/PWAService.jsm"
);

const PWA = {
  _pwa: null,
  _browser: null,

  init() {
    window.docShell.treeOwner
      .QueryInterface(Ci.nsIInterfaceRequestor)
      .getInterface(Ci.nsIXULWindow).XULBrowserWindow = this;
    window.browserDOMWindow = this;

    this._browser = document.getElementById("content");
    this._pwa = window.arguments[0].wrappedJSObject;
    let loadInfo = window.arguments[1];
    if (loadInfo) {
      loadInfo.QueryInterface(Ci.nsIPWALoadInfo);
    }

    this._browser.messageManager.addMessageListener("PWA:GetId", this);
    this._browser.messageManager.loadFrameScript(
      "chrome://browser/content/pwa/pwa-content.js",
      true,
      true
    );

    document.documentElement.setAttribute("title", this._pwa.name);
    document.documentElement.setAttribute("windowtype", `pwa:${this._pwa.id}`);

    this.load(loadInfo);
  },

  receiveMessage({ name, data }) {
    if (name == "PWA:GetId") {
      return this._pwa.id;
    }
    return undefined;
  },

  load(loadInfo = null) {
    if (loadInfo) {
      this._browser.loadURI(loadInfo.uri, {
        triggeringPrincipal: Services.scriptSecurityManager.getSystemPrincipal(),
      });
    } else {
      this._browser.loadURI(this._pwa.url, {
        triggeringPrincipal: Services.scriptSecurityManager.getSystemPrincipal(),
      });
    }
  },

  // nsIWebBrowserChrome

  setStatus(statusType, status) {
    throw Components.Exception("Not implemented.", Cr.NS_ERROR_NOT_IMPLEMENTED);
  },

  get chromeFlags() {
    throw Components.Exception("Not implemented.", Cr.NS_ERROR_NOT_IMPLEMENTED);
  },

  set chromeFlags(flags) {
    throw Components.Exception("Not implemented.", Cr.NS_ERROR_NOT_IMPLEMENTED);
  },

  showAsModal() {
    throw Components.Exception("Not implemented.", Cr.NS_ERROR_NOT_IMPLEMENTED);
  },

  isWindowModal() {
    throw Components.Exception("Not implemented.", Cr.NS_ERROR_NOT_IMPLEMENTED);
  },

  // nsIWebBrowserChrome2

  setStatusWithContext(statusType, statusText, statusContext) {
    throw Components.Exception("Not implemented.", Cr.NS_ERROR_NOT_IMPLEMENTED);
  },

  // nsIWebBrowserChrome3

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

  reloadInFreshProcess(docShell, uri, triggeringPrincipal, loadFlags, csp) {
    throw Components.Exception("Not implemented.", Cr.NS_ERROR_NOT_IMPLEMENTED);
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

  // nsIBrowserDOMWindow

  createContentWindow(uri, opener, where, flags, triggeringPrincipal, csp) {
    console.log(`parent createContentWindow ${uri.spec}`);
    throw Components.Exception("Not implemented.", Cr.NS_ERROR_NOT_IMPLEMENTED);
  },

  createContentWindowInFrame(uri, params, where, flags, nextRemoteTabId, name) {
    console.log(`parent createContentWindowInFrame ${uri.spec}`);
    throw Components.Exception("Not implemented.", Cr.NS_ERROR_NOT_IMPLEMENTED);
  },

  openURI(uri, opener, where, flags, triggeringPrincipal, csp) {
    this.load({
      uri: uri.spec,
    });
  },

  openURIInFrame(uri, params, where, flags, nextRemoteTabId, name) {
    console.log(`parent openURIInFrame ${uri.spec}`);
    throw Components.Exception("Not implemented.", Cr.NS_ERROR_NOT_IMPLEMENTED);
  },

  isTabContentWindow(window) {
    return this._browser.contentWindow == window;
  },

  canClose() {
    // XXX TODO
    return true;
  },

  get tabCount() {
    return 1;
  },

  QueryInterface: ChromeUtils.generateQI([
    Ci.nsIXULBrowserWindow,
    Ci.nsIBrowserDOMWindow,
    Ci.nsIPWAWindow,
  ]),
};
