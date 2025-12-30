/* Any copyright is dedicated to the Public Domain.
   http://creativecommons.org/publicdomain/zero/1.0/ */

add_task(
  {
    skip_if: () => !AppConstants.MOZ_SELECTABLE_PROFILES,
  },
  async function test_switchStore_keeps_old_store_when_multiple_profiles() {
    let hash = xreDirProvider.getInstallHash();
    let defaultProfile = makeRandomProfileDir("default");

    writeProfilesIni({
      profiles: [
        {
          name: "default",
          path: defaultProfile.leafName,
          default: true,
          storeID: "multiprofile1",
        },
      ],
      installs: {
        [hash]: {
          default: defaultProfile.leafName,
        },
      },
    });

    Services.prefs.setStringPref("toolkit.profiles.storeID", "multiprofile1");

    let profileService = getProfileService();
    if (profileService.currentProfile) {
      profileService.currentProfile.storeID = "multiprofile1";
    }

    await ProfilesDatastoreService.init();

    let conn = await ProfilesDatastoreService.getConnection();
    await insertProfile(conn, getCurrentProfileRelativePath(), "Current Profile");
    await insertProfile(conn, "other/profile/path", "Other Profile");

    let oldDbPath = await ProfilesDatastoreService.getProfilesStorePath();
    Assert.ok(await IOUtils.exists(oldDbPath), "Old store should exist before switch");

    await ProfilesDatastoreService.switchStore("multiprofile2");

    Assert.ok(
      await IOUtils.exists(oldDbPath),
      "Old store should be kept when other profiles are still using it"
    );

    await ProfilesDatastoreService.uninit();
  }
);
