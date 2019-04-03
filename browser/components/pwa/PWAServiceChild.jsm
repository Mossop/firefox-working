/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const EXPORTED_SYMBOLS = ["PWAService"];

const { PWABase, PWAServiceBase } = ChromeUtils.import(
  "resource:///modules/PWACommon.jsm"
);
ChromeUtils.defineModuleGetter(
  this,
  "Services",
  "resource://gre/modules/Services.jsm"
);

class PWAChild extends PWABase {
  load(loadInfo = null) {
    Services.cpmm.sendAsyncMessage("PWA:Load", {
      id: this.id,
      loadInfo,
    });
  }

  static fromJSON({ id, dir, manifest }) {
    return new PWAChild(id, dir, manifest);
  }
}

const PWACache = {
  init() {
    this._cache = new Map();
    this._rebuildCache();
    Services.cpmm.sharedData.addEventListener("change", event => {
      if (event.changedKeys.includes("pwa")) {
        this._rebuildCache();
      }
    });
  },

  _rebuildCache() {
    this._cache.clear();

    let info = Services.cpmm.sharedData.get("pwa");

    if (!info) {
      return;
    }

    let data = JSON.parse(info);

    for (let [id, manifest] of Object.entries(data)) {
      this._cache.set(id, PWAChild.fromJSON(manifest));
    }
  },

  get(id) {
    return this._cache.get(id);
  },

  set() {
    throw Components.Exception(
      "Not supported in content processes.",
      Cr.NS_ERROR_NOT_IMPLEMENTED
    );
  },

  delete() {
    throw Components.Exception(
      "Not supported in content processes.",
      Cr.NS_ERROR_NOT_IMPLEMENTED
    );
  },

  list() {
    return Array.from(this._cache.values());
  },
};

class PWAServiceChild extends PWAServiceBase {
  constructor() {
    super();
    PWACache.init();
  }

  openInBrowser(loadInfo) {
    Services.cpmm.sendAsyncMessage("PWA:OpenInBrowser", {
      loadInfo,
    });
  }

  get(id) {
    return PWACache.get(id);
  }

  list() {
    return PWACache.list();
  }

  delete() {
    throw Components.Exception(
      "Not supported in content processes.",
      Cr.NS_ERROR_NOT_IMPLEMENTED
    );
  }
}

const PWAService = new PWAServiceChild();
