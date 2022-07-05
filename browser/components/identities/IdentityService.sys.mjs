/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const { XPCOMUtils } = ChromeUtils.import(
  "resource://gre/modules/XPCOMUtils.jsm"
);

const lazy = {};

XPCOMUtils.defineLazyModuleGetters(lazy, {
  KeyValueService: "resource://gre/modules/kvstore.jsm",
});

const KEY_IDENTITIES = "identities";
const KEY_IDENTITY = "identity:";

const uuid = () =>
  Services.uuid
    .generateUUID()
    .toString()
    .slice(1, -1);

const DEFAULT_IDENTITY = "00000000-0000-0000-0000-000000000000";

const ICONS = {
  fence: "resource://usercontext-content/fence.svg",
  fingerprint: "resource://usercontext-content/fingerprint.svg",
  briefcase: "resource://usercontext-content/briefcase.svg",
  dollar: "resource://usercontext-content/dollar.svg",
  cart: "resource://usercontext-content/cart.svg",
  circle: "resource://usercontext-content/circle.svg",
  vacation: "resource://usercontext-content/vacation.svg",
  gift: "resource://usercontext-content/gift.svg",
  food: "resource://usercontext-content/food.svg",
  fruit: "resource://usercontext-content/fruit.svg",
  pet: "resource://usercontext-content/pet.svg",
  tree: "resource://usercontext-content/tree.svg",
  chill: "resource://usercontext-content/chill.svg",
};

async function get(store, key, defaultValue) {
  let value = await store.get(key, null);
  if (value === null) {
    return defaultValue;
  }

  return JSON.parse(value);
}

function put(store, key, value) {
  return store.put(key, JSON.stringify(value));
}

class Identity {
  #id = null;

  constructor({ id, name, icon, color }) {
    this.#id = id;
    this.name = name;
    this.icon = icon;
    this.color = color;
  }

  get iconURL() {
    if (this.icon && this.icon in ICONS) {
      return ICONS[this.icon];
    }

    return "chrome://browser/skin/fxa/avatar.svg";
  }

  launch() {
    try {
      let { currentProfile } = Cc[
        "@mozilla.org/toolkit/profile-service;1"
      ].getService(Ci.nsIToolkitProfileService);

      if (!currentProfile) {
        throw new Error("Can only work in a named profile.");
      }

      let process = Cc["@mozilla.org/process/util;1"].createInstance(
        Ci.nsIProcess
      );
      let binary = Services.dirsvc.get("XREExeF", Ci.nsIFile);
      let args = ["-P", currentProfile.name, "-I", this.id, "-foreground"];
      console.log("Launch", binary.path, ...args);
      process.init(binary);
      process.noShell = true;
      process.runw(false, args, args.length);
    } catch (e) {
      console.error(e);
    }
  }

  get isRoot() {
    return this.id == DEFAULT_IDENTITY;
  }

  get isDefault() {
    let { currentProfile } = Cc[
      "@mozilla.org/toolkit/profile-service;1"
    ].getService(Ci.nsIToolkitProfileService);

    if (!currentProfile) {
      throw new Error("Can only work in a named profile.");
    }

    let expected = this.id == DEFAULT_IDENTITY ? null : this.id;
    return currentProfile.defaultIdentity == expected;
  }

  get isCurrent() {
    let { currentProfile } = Cc[
      "@mozilla.org/toolkit/profile-service;1"
    ].getService(Ci.nsIToolkitProfileService);

    if (!currentProfile) {
      throw new Error("Can only work in a named profile.");
    }

    let expected = this.id == DEFAULT_IDENTITY ? null : this.id;
    return currentProfile.currentIdentity == expected;
  }

  get id() {
    return this.#id;
  }

  async delete() {
    if (this.isRoot) {
      throw new Error("Cannot remove the default identity");
    }

    let store = await IdentityService.store;

    let ids = new Set(await get(store, KEY_IDENTITIES, []));
    ids.delete(this.id);
    await put(store, KEY_IDENTITIES, [...ids]);

    let dir = await IdentityService.identityPath(this.id);
    await IOUtils.remove(dir, {
      ignoreAbsent: true,
      recursive: true,
    });
  }

  async store() {
    let store = await IdentityService.store;

    await put(store, `${KEY_IDENTITY}${this.id}`, {
      id: this.id,
      name: this.name,
      icon: this.icon,
      color: this.color,
    });
  }

  static async fromStore(id) {
    let store = await IdentityService.store;

    let data = await get(store, `${KEY_IDENTITY}${id}`, null);
    if (!data) {
      if (id == DEFAULT_IDENTITY) {
        return new Identity({
          id,
          name: "Default",
          icon: null,
        });
      }
      throw new Error(`Bad identity in store: ${id}`);
    }

    return new Identity(data);
  }
}

export const IdentityService = new (class IdentityService {
  #store = null;

  get supported() {
    let { currentProfile } = Cc[
      "@mozilla.org/toolkit/profile-service;1"
    ].getService(Ci.nsIToolkitProfileService);

    return !!currentProfile;
  }

  async #openStore() {
    let { currentProfile } = Cc[
      "@mozilla.org/toolkit/profile-service;1"
    ].getService(Ci.nsIToolkitProfileService);

    if (!currentProfile) {
      throw new Error("Can only work in a named profile.");
    }

    let profileRoot = currentProfile.rootDir.path;
    let dir = PathUtils.join(profileRoot, "settings");
    await IOUtils.makeDirectory(dir);
    return lazy.KeyValueService.getOrCreate(dir, "identities");
  }

  async get(id) {
    return Identity.fromStore(id);
  }

  async identityPath(id) {
    let { currentProfile } = Cc[
      "@mozilla.org/toolkit/profile-service;1"
    ].getService(Ci.nsIToolkitProfileService);

    if (!currentProfile) {
      throw new Error("Can only work in a named profile.");
    }

    let profileRoot = currentProfile.rootDir.path;
    let dir = PathUtils.join(profileRoot, "identities");
    await IOUtils.makeDirectory(dir);
    dir = PathUtils.join(dir, id);
    await IOUtils.makeDirectory(dir);
    return dir;
  }

  get store() {
    if (this.#store) {
      return this.#store;
    }

    return (this.#store = this.#openStore());
  }

  async list() {
    let store = await this.store;
    let ids = await get(store, KEY_IDENTITIES, []);

    return Promise.all([
      Identity.fromStore(DEFAULT_IDENTITY),
      ...ids.map(Identity.fromStore),
    ]);
  }

  async create(name, icon = null) {
    let store = await this.store;

    let id = uuid();
    await this.identityPath(id);

    let identity = new Identity({ id, name, icon });
    await identity.store();

    let ids = await get(store, KEY_IDENTITIES, []);
    await put(store, KEY_IDENTITIES, [...ids, id]);

    return identity;
  }
})();
