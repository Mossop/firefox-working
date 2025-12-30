/* Any copyright is dedicated to the Public Domain.
   http://creativecommons.org/publicdomain/zero/1.0/ */

add_task(
  {
    skip_if: () => !AppConstants.MOZ_SELECTABLE_PROFILES,
  },
  async function test_switchStore_events() {
    let hash = xreDirProvider.getInstallHash();
    let defaultProfile = makeRandomProfileDir("default");

    let profilesIni = {
      profiles: [
        {
          name: "default",
          path: defaultProfile.leafName,
          default: true,
          storeID: "old12345",
        },
      ],
      installs: {
        [hash]: {
          default: defaultProfile.leafName,
        },
      },
    };

    writeProfilesIni(profilesIni);

    Services.prefs.setStringPref("toolkit.profiles.storeID", "old12345");

    // Initialize profile service
    let profileService = getProfileService();

    // Ensure the current profile has the storeID property set
    if (profileService.currentProfile) {
      profileService.currentProfile.storeID = "old12345";
    }

    await ProfilesDatastoreService.init();

    // Verify storeID is loaded
    let currentStoreID = await ProfilesDatastoreService.storeID;
    Assert.equal(
      currentStoreID,
      "old12345",
      "Initial storeID should be old12345"
    );

    let preSwitchEvents = [];
    let postSwitchEvents = [];

    const preSwitchHandler = (_event, eventData) => {
      preSwitchEvents.push(eventData);
    };

    const postSwitchHandler = (_event, eventData) => {
      postSwitchEvents.push(eventData);
    };

    ProfilesDatastoreService.on("store-will-switch", preSwitchHandler);
    ProfilesDatastoreService.on("store-switched", postSwitchHandler);

    // Ensure we're fully initialized before switching
    await ProfilesDatastoreService.init();

    await ProfilesDatastoreService.switchStore("new12345");

    Assert.equal(preSwitchEvents.length, 1, "Should emit one pre-switch event");
    Assert.equal(
      preSwitchEvents[0].oldStoreID,
      "old12345",
      "Pre-switch event should have correct oldStoreID"
    );
    Assert.equal(
      preSwitchEvents[0].newStoreID,
      "new12345",
      "Pre-switch event should have correct newStoreID"
    );
    Assert.strictEqual(
      typeof preSwitchEvents[0].addCleanupPromise,
      "function",
      "Pre-switch event should have addCleanupPromise function"
    );

    Assert.equal(
      postSwitchEvents.length,
      1,
      "Should emit one post-switch event"
    );
    Assert.equal(
      postSwitchEvents[0].oldStoreID,
      "old12345",
      "Post-switch event should have correct oldStoreID"
    );

    Assert.equal(
      await ProfilesDatastoreService.storeID,
      "new12345",
      "StoreID should be updated to new12345"
    );

    Assert.equal(
      Services.prefs.getStringPref("toolkit.profiles.storeID"),
      "new12345",
      "StoreID preference should be updated"
    );

    ProfilesDatastoreService.off("store-will-switch", preSwitchHandler);
    ProfilesDatastoreService.off("store-switched", postSwitchHandler);

    await ProfilesDatastoreService.uninit();
  }
);
