/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const EXPORTED_SYMBOLS = ["PWABase", "PWAServiceBase"];

ChromeUtils.defineModuleGetter(
  this,
  "Services",
  "resource://gre/modules/Services.jsm"
);

class PWABase {
  constructor(id, dir, manifest) {
    this._id = id;
    this._dir = dir;
    this._manifest = manifest;

    // Make it easy to pass through XPCOM.
    this.wrappedJSObject = this;
  }

  get id() {
    return this._id;
  }

  get name() {
    return this._manifest.name;
  }

  get url() {
    return this._manifest.start_url;
  }

  get icons() {
    let icons = Cc["@mozilla.org/array;1"].createInstance(Ci.nsIMutableArray);
    for (let icon of this._manifest.icons) {
      icons.appendElement(icon);
    }
    return icons;
  }

  open() {
    return this.load();
  }

  load() {
    throw Components.Exception("Not Implemented", Cr.NS_ERROR_NOT_IMPLEMENTED);
  }

  canLoad(uri, isCurrent) {
    let target = uri instanceof Ci.nsIURI ? uri : Services.io.newURI(uri);

    if (!target.schemeIs("https")) {
      return false;
    }

    let scope = Services.io.newURI(this._manifest.scope);
    if (target.hostPort == scope.hostPort && target.prePath == scope.prePath) {
      return target.filePath.startsWith(scope.filePath);
    }

    if (!isCurrent) {
      return false;
    }

    // Allow other services on the same domain.
    return (
      Services.eTLD.getBaseDomain(scope) == Services.eTLD.getBaseDomain(target)
    );
  }

  equalsPWA(other) {
    // Going to define two PWAs as equal if they have the same scope.
    return this._manifest.scope == other._manifest.scope;
  }

  equalsManifest(manifest) {
    // Going to define two PWAs as equal if they have the same scope.
    return this._manifest.scope == manifest.scope;
  }

  toJSON() {
    return {
      id: this._id,
      dir: this._dir,
      manifest: this._manifest,
    };
  }
}

class PWAServiceBase {
  openInBrowser() {
    throw Components.Exception("Not Implemented", Cr.NS_ERROR_NOT_IMPLEMENTED);
  }

  getPWAForLoad(uri, pwa = null) {
    if (pwa && pwa.canLoad(uri, true)) {
      return pwa;
    }

    return this.list()
      .filter(p => p != pwa)
      .find(p => p.canLoad(uri, false));
  }

  onBeforeLinkTraversal(pwa, originalTarget, uri, linkNode, isAppTab) {
    // Not sure if we need this.
    return originalTarget;
  }

  shouldLoadURI(
    pwa,
    docShell,
    uri,
    referrer,
    hasPostData,
    triggeringPrincipal,
    csp
  ) {
    // Don't think we need to handle this case.
    return true;
  }

  onBeforeOpenWindow(
    pwa,
    parent,
    uri,
    name,
    features,
    args,
    calledFromJS,
    isPopupSpam
  ) {
    let pwaTarget = this.getPWAForLoad(uri, pwa);
    if (!pwa && !pwaTarget) {
      return null;
    }

    if (pwaTarget) {
      pwaTarget.load({
        uri: uri.spec,
      });
    } else {
      this.openInBrowser({
        uri: uri.spec,
      });
    }

    throw Components.Exception("Block opening new window", Cr.NS_ERROR_ABORT);
  }

  loadURI(pwa, uri, where, flags, triggeringPrincipal) {
    let pwaTarget = this.getPWAForLoad(uri, pwa);
    if (pwaTarget == pwa) {
      return false;
    }

    if (pwaTarget) {
      pwaTarget.load({
        uri: uri.spec,
      });
    } else {
      this.openInBrowser({
        uri: uri.spec,
      });
    }

    return true;
  }
}
