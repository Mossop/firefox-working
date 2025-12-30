/* Any copyright is dedicated to the Public Domain.
   http://creativecommons.org/publicdomain/zero/1.0/ */

add_task(
  {
    skip_if: () => !AppConstants.MOZ_SELECTABLE_PROFILES,
  },
  async function test_switchStore_deletes_old_store_when_only_profile() {
    let hash = xreDirProvider.getInstallHash();
    let defaultProfile = makeRandomProfileDir("default");

    writeProfilesIni({
      profiles: [
        {
          name: "default",
          path: defaultProfile.leafName,
          default: true,
          storeID: "onlyprofile1",
        },
      ],
      installs: {
        [hash]: {
          default: defaultProfile.leafName,
        },
      },
    });

    Services.prefs.setStringPref("toolkit.profiles.storeID", "onlyprofile1");

    let profileService = getProfileService();
    if (profileService.currentProfile) {
      profileService.currentProfile.storeID = "onlyprofile1";
    }

    await ProfilesDatastoreService.init();

    let conn = await ProfilesDatastoreService.getConnection();
    await insertProfile(conn, getCurrentProfileRelativePath(), "Current Profile");

    let oldDbPath = await ProfilesDatastoreService.getProfilesStorePath();
    Assert.ok(await IOUtils.exists(oldDbPath), "Old store should exist before switch");

    await ProfilesDatastoreService.switchStore("onlyprofile2");

    Assert.ok(
      !(await IOUtils.exists(oldDbPath)),
      "Old store should be deleted when current profile was the only one"
    );

    await ProfilesDatastoreService.uninit();
  }
);
