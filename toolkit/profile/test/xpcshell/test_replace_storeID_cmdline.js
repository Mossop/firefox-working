/* Any copyright is dedicated to the Public Domain.
   http://creativecommons.org/publicdomain/zero/1.0/ */

/*
 * Tests that the storeID can be specified on the command line and this has the effect of selecting
 * the correct current profile and updating the preference.
 */
add_task(
  {
    skip_if: () => !AppConstants.MOZ_SELECTABLE_PROFILES,
  },
  async () => {
    Services.prefs.setCharPref("toolkit.profiles.storeID", "badstoreid");

    let hash = xreDirProvider.getInstallHash();
    let defaultProfile = makeRandomProfileDir("default");
    let otherProfile = makeRandomProfileDir("other");
    let profilesIni = {
      profiles: [
        {
          name: "default",
          path: defaultProfile.leafName,
          storeID: "bishbashbosh",
          default: true,
        },
      ],
      installs: {
        [hash]: {
          default: defaultProfile.leafName,
        },
      },
    };
    writeProfilesIni(profilesIni);

    let service = getProfileService();
    let { profile, rootDir } = selectStartupProfile([
      "-profile",
      otherProfile.path,
      "-profile-store-id",
      "bishbashbosh",
    ]);

    let storeID = Services.prefs.getCharPref("toolkit.profiles.storeID");

    Assert.ok(!profile);
    Assert.equal(rootDir.path, otherProfile.path);
    Assert.ok(service.currentProfile);
    Assert.equal(service.currentProfile.rootDir.path, defaultProfile.path);
    Assert.equal(service.currentProfile.storeID, "bishbashbosh");
    Assert.equal(storeID, "bishbashbosh");

    checkProfileService();
  }
);
