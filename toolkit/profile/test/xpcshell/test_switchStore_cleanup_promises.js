/* Any copyright is dedicated to the Public Domain.
   http://creativecommons.org/publicdomain/zero/1.0/ */

add_task(
  {
    skip_if: () => !AppConstants.MOZ_SELECTABLE_PROFILES,
  },
  async function test_switchStore_cleanup_promises() {
    let hash = xreDirProvider.getInstallHash();
    let defaultProfile = makeRandomProfileDir("default");

    let profilesIni = {
      profiles: [
        {
          name: "default",
          path: defaultProfile.leafName,
          default: true,
          storeID: "test12345",
        },
      ],
      installs: {
        [hash]: {
          default: defaultProfile.leafName,
        },
      },
    };

    writeProfilesIni(profilesIni);

    Services.prefs.setStringPref("toolkit.profiles.storeID", "test12345");

    // Initialize profile service
    let profileService = getProfileService();

    // Ensure the current profile has the storeID property set
    if (profileService.currentProfile) {
      profileService.currentProfile.storeID = "test12345";
    }

    await ProfilesDatastoreService.init();

    let cleanupCompleted = false;

    const preSwitchHandler = (_event, { addCleanupPromise }) => {
      const cleanupPromise = (async () => {
        await new Promise(resolve => do_timeout(100, resolve));
        cleanupCompleted = true;
      })();
      addCleanupPromise(cleanupPromise);
    };

    ProfilesDatastoreService.on("store-will-switch", preSwitchHandler);

    await ProfilesDatastoreService.switchStore("new12346");

    Assert.ok(
      cleanupCompleted,
      "Cleanup promise should be completed before switch finishes"
    );

    ProfilesDatastoreService.off("store-will-switch", preSwitchHandler);

    await ProfilesDatastoreService.uninit();
  }
);
