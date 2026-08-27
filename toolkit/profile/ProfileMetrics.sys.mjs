/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { AsyncShutdown } from "resource://gre/modules/AsyncShutdown.sys.mjs";

const NEW_PROFILE_PREF = "toolkit.profiles.newProfileSubmitted";
const STOREID_PREF = "toolkit.profiles.storeID";
const MS_PER_SEC = 1000;

export let ProfileMetrics = {
  async init() {
    let isNewProfile = !Services.prefs.getBoolPref(NEW_PROFILE_PREF, false);

    let collectPromise = this._collectProfileData(isNewProfile).catch(e => {
      console.error("ProfileMetrics: failed to collect profile data", e);
    });

    if (isNewProfile) {
      AsyncShutdown.profileBeforeChange.addBlocker(
        "ProfileMetrics: submit new profile ping",
        async () => {
          await collectPromise;
          this._onShutdown();
        }
      );
    }
  },

  _onShutdown() {
    if (!Services.prefs.getBoolPref(NEW_PROFILE_PREF, false)) {
      GleanPings.newProfile.submit();
      Services.prefs.setBoolPref(NEW_PROFILE_PREF, true);
    }
  },

  async _collectProfileData(isNewProfile) {
    let currentProfileDir = Services.dirsvc.get("ProfD", Ci.nsIFile);
    let profileService = Cc[
      "@mozilla.org/toolkit/profile-service;1"
    ].getService(Ci.nsIToolkitProfileService);

    let knownStoreIDs = new Set();
    let knownProfilePaths = new Set();
    let currentProfileInIni = false;
    let currentStoreID =
      Services.prefs.getStringPref(STOREID_PREF, "") || null;

    for (let profile of profileService.profiles) {
      if (profile.storeID) {
        knownStoreIDs.add(profile.storeID);
      }
      let path = profile.rootDir.path;
      knownProfilePaths.add(path);
      if (path == currentProfileDir.path) {
        currentProfileInIni = true;
      }
    }

    Glean.profiles.pathInProfilesIni.set(currentProfileInIni);
    if (currentStoreID) {
      Glean.profiles.storeIdInProfilesIni.set(
        knownStoreIDs.has(currentStoreID)
      );
    }

    let currentProfile = profileService.currentProfile;
    if (currentProfile) {
      let profileStoreID = currentProfile.storeID;
      Glean.profiles.storeIdMismatch.set(
        (!!currentStoreID || !!profileStoreID) &&
          currentStoreID != profileStoreID
      );
    } else {
      Glean.profiles.storeIdMismatch.set(false);
    }

    if (!isNewProfile) {
      return;
    }

    let possibleProfileDirs = new Set(knownProfilePaths);

    let defProfRt = Services.dirsvc.get("DefProfRt", Ci.nsIFile);
    let entries;
    try {
      entries = await IOUtils.getChildren(defProfRt.path);
    } catch (e) {
      entries = [];
    }

    for (let entryPath of entries) {
      let info = await IOUtils.stat(entryPath).catch(() => null);
      if (info && info.type == "directory") {
        possibleProfileDirs.add(entryPath);
      }
    }

    possibleProfileDirs.delete(currentProfileDir.path);

    let allData = await Promise.all(
      Array.from(possibleProfileDirs, dir =>
        this._gatherProfileData(dir, knownStoreIDs, knownProfilePaths, currentStoreID).catch(
          e => {
            console.error(
              `ProfileMetrics: failed to gather data for ${dir}`,
              e
            );
            return null;
          }
        )
      )
    );

    let otherProfiles = allData.filter(Boolean);

    Glean.profiles.otherProfiles.set(otherProfiles);

    await this._collectInstallData();
  },

  async _gatherProfileData(
    profilePath,
    knownStoreIDs,
    knownProfilePaths,
    currentStoreID
  ) {
    let storeID = await this._extractStoreID(profilePath);

    let { isSameInstall, installExists } =
      await this._checkInstall(profilePath);

    let stat = await IOUtils.stat(PathUtils.join(profilePath, "prefs.js"));

    return {
      path_in_profiles_ini: knownProfilePaths.has(profilePath),
      store_id_in_profiles_ini: knownStoreIDs.has(storeID),
      is_current_group: currentStoreID && storeID
        ? storeID == currentStoreID
        : false,
      is_same_install: isSameInstall,
      install_exists: installExists,
      last_used_seconds: Math.floor(
        (Date.now() - stat.lastModified) / MS_PER_SEC
      ),
    };
  },

  async _extractStoreID(profilePath) {
    try {
      let prefsContent = await IOUtils.readUTF8(
        PathUtils.join(profilePath, "prefs.js")
      );
      let match = prefsContent.match(
        /user_pref\("toolkit\.profiles\.storeID",\s*"([^"]+)"\)/
      );
      return match ? match[1] : null;
    } catch (e) {
      return null;
    }
  },

  async _checkInstall(profilePath) {
    let compatPath = PathUtils.join(profilePath, "compatibility.ini");
    let content = await IOUtils.readUTF8(compatPath);

    let factory = Cc["@mozilla.org/xpcom/ini-parser-factory;1"].getService(
      Ci.nsIINIParserFactory
    );
    let parser = factory.createINIParser();
    parser.initFromString(content);

    let lastPlatformDir = parser.getString("Compatibility", "LastPlatformDir");

    let lastDir = Cc["@mozilla.org/file/local;1"].createInstance(Ci.nsIFile);
    lastDir.initWithPath(lastPlatformDir);

    let currentGreDir = Services.dirsvc.get("GreD", Ci.nsIFile);
    let isSameInstall = lastDir.equals(currentGreDir);
    let installExists = lastDir.exists();

    return { isSameInstall, installExists };
  },

  async _readInstallTimestamp(path, isUTF16LE) {
    try {
      let bytes = await IOUtils.read(path);
      let text;
      if (isUTF16LE) {
        text = new TextDecoder("utf-16le").decode(bytes);
      } else {
        text = new TextDecoder().decode(bytes);
      }
      let data = JSON.parse(text);
      if (data.install_timestamp != null) {
        return Number(data.install_timestamp);
      }
    } catch (e) {}
    return null;
  },

  async _collectInstallData() {
    let greDir = Services.dirsvc.get("GreD", Ci.nsIFile);
    let nowSec = Math.floor(Date.now() / MS_PER_SEC);

    if (Services.appinfo.OS == "WINNT") {
      let installPath = PathUtils.join(
        greDir.path,
        "installation_telemetry.json"
      );
      let filetime = await this._readInstallTimestamp(installPath, true);
      if (filetime != null) {
        let epochOffset = 116444736000000000;
        if (filetime > epochOffset) {
          let installSec = Math.floor((filetime - epochOffset) / 10000000);
          Glean.profiles.secondsSinceInstall.set(nowSec - installSec);
        }
      }
    }

    let updatePath = PathUtils.join(greDir.path, "update_telemetry.json");
    let msTime = await this._readInstallTimestamp(updatePath, false);
    if (msTime != null) {
      let updateSec = Math.floor(msTime / MS_PER_SEC);
      Glean.profiles.secondsSinceUpdate.set(nowSec - updateSec);
    }
  },
};
