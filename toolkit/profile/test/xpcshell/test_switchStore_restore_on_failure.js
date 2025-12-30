/* Any copyright is dedicated to the Public Domain.
   http://creativecommons.org/publicdomain/zero/1.0/ */

add_task(
  {
    skip_if: () => !AppConstants.MOZ_SELECTABLE_PROFILES,
  },
  async function test_switchStore_restores_current_profile_storeID_on_failure() {
    let hash = xreDirProvider.getInstallHash();
    let defaultProfile = makeRandomProfileDir("default");

    let profilesIni = {
      profiles: [
        {
          name: "default",
          path: defaultProfile.leafName,
          default: true,
          storeID: "stable1234",
        },
      ],
      installs: {
        [hash]: {
          default: defaultProfile.leafName,
        },
      },
    };

    writeProfilesIni(profilesIni);

    Services.prefs.setStringPref("toolkit.profiles.storeID", "stable1234");

    let profileService = getProfileService();
    if (profileService.currentProfile) {
      profileService.currentProfile.storeID = "stable1234";
    }

    await ProfilesDatastoreService.init();

    const originalInit = ProfilesDatastoreService.init;
    let shouldFailInit = true;
    const preSwitchHandler = () => {
      ProfilesDatastoreService.init = async function (...args) {
        if (shouldFailInit) {
          shouldFailInit = false;
          throw new Error("switchStore init failure");
        }

        return originalInit.apply(this, args);
      };
    };

    ProfilesDatastoreService.on("store-will-switch", preSwitchHandler);

    try {
      await Assert.rejects(
        ProfilesDatastoreService.switchStore("broken5678"),
        /switchStore init failure/,
        "switchStore should reject when opening the new store fails"
      );
    } finally {
      ProfilesDatastoreService.off("store-will-switch", preSwitchHandler);
      ProfilesDatastoreService.init = originalInit;
    }

    Assert.equal(
      await ProfilesDatastoreService.storeID,
      "stable1234",
      "The datastore service should restore the original store ID"
    );
    Assert.equal(
      Services.prefs.getStringPref("toolkit.profiles.storeID"),
      "stable1234",
      "The store ID pref should be restored after failure"
    );

    await ProfilesDatastoreService.uninit();
  }
);
