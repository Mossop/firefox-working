/* Any copyright is dedicated to the Public Domain.
   http://creativecommons.org/publicdomain/zero/1.0/ */

const { ProfileMetrics } = ChromeUtils.importESModule(
  "moz-src:///toolkit/profile/ProfileMetrics.sys.mjs"
);
const { AsyncShutdown } = ChromeUtils.importESModule(
  "resource://gre/modules/AsyncShutdown.sys.mjs"
);

add_task(async function test_seconds_since_update() {
  Services.fog.testResetFOG();

  let greDir = Services.dirsvc.get("GreD", Ci.nsIFile);
  let updatePath = PathUtils.join(greDir.path, "update_telemetry.json");

  registerCleanupFunction(async () => {
    await IOUtils.remove(updatePath, { ignoreAbsent: true });
  });

  let fiveMinutesAgoMs = Date.now() - 5 * 60 * 1000;
  await IOUtils.writeUTF8(
    updatePath,
    JSON.stringify({ install_timestamp: String(fiveMinutesAgoMs) })
  );

  selectStartupProfile();

  Services.prefs.setBoolPref("toolkit.profiles.newProfileSubmitted", false);
  Services.prefs.setBoolPref("toolkit.asyncshutdown.testing", true);
  await ProfileMetrics.init();

  await GleanPings.newProfile.testSubmission(
    () => {
      let value = Glean.profiles.secondsSinceUpdate.testGetValue();
      Assert.greaterOrEqual(value, 300, "Should be at least 300 seconds");
      Assert.lessOrEqual(value, 360, "Should be no more than 360 seconds");
    },
    () => {
      AsyncShutdown.profileBeforeChange._trigger();
    }
  );
});
