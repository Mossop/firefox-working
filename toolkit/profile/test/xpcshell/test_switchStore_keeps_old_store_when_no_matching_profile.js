/* Any copyright is dedicated to the Public Domain.
   http://creativecommons.org/publicdomain/zero/1.0/ */

add_task(
  {
    skip_if: () => !AppConstants.MOZ_SELECTABLE_PROFILES,
  },
  async function test_switchStore_keeps_old_store_when_no_matching_profile() {
    let hash = xreDirProvider.getInstallHash();
    let defaultProfile = makeRandomProfileDir("default");

    writeProfilesIni({
      profiles: [
        {
          name: "default",
          path: defaultProfile.leafName,
          default: true,
          storeID: "nomatch1",
        },
      ],
      installs: {
        [hash]: {
          default: defaultProfile.leafName,
        },
      },
    });

    Services.prefs.setStringPref("toolkit.profiles.storeID", "nomatch1");

    let profileService = getProfileService();
    if (profileService.currentProfile) {
      profileService.currentProfile.storeID = "nomatch1";
    }

    await ProfilesDatastoreService.init();

    let conn = await ProfilesDatastoreService.getConnection();
    await insertProfile(conn, "other/profile/one", "Other Profile One");
    await insertProfile(conn, "other/profile/two", "Other Profile Two");

    let oldDbPath = await ProfilesDatastoreService.getProfilesStorePath();
    Assert.ok(await IOUtils.exists(oldDbPath), "Old store should exist before switch");

    await ProfilesDatastoreService.switchStore("nomatch2");

    Assert.ok(
      await IOUtils.exists(oldDbPath),
      "Old store should be kept when no profile in the store matches the current profile"
    );

    await ProfilesDatastoreService.uninit();
  }
);
