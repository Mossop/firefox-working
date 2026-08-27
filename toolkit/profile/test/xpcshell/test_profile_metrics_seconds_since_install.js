/* Any copyright is dedicated to the Public Domain.
   http://creativecommons.org/publicdomain/zero/1.0/ */

const { ProfileMetrics } = ChromeUtils.importESModule(
  "moz-src:///toolkit/profile/ProfileMetrics.sys.mjs"
);
const { AsyncShutdown } = ChromeUtils.importESModule(
  "resource://gre/modules/AsyncShutdown.sys.mjs"
);

add_task(async function test_seconds_since_install() {
  Services.fog.testResetFOG();

  let greDir = Services.dirsvc.get("GreD", Ci.nsIFile);
  let installPath = PathUtils.join(
    greDir.path,
    "installation_telemetry.json"
  );

  registerCleanupFunction(async () => {
    await IOUtils.remove(installPath, { ignoreAbsent: true });
  });

  // Convert 5 minutes ago to a Windows FILETIME (100ns intervals since
  // Jan 1 1601 UTC).
  let fiveMinutesAgoMs = Date.now() - 5 * 60 * 1000;
  let epochOffset = 116444736000000000;
  let filetime = fiveMinutesAgoMs * 10000 + epochOffset;

  let json = JSON.stringify({ install_timestamp: String(filetime) });
  let utf8 = new TextEncoder().encode(json);
  let u16 = new Uint8Array(utf8.length * 2);
  for (let i = 0; i < utf8.length; i++) {
    u16[i * 2] = utf8[i];
    u16[i * 2 + 1] = 0;
  }
  await IOUtils.write(installPath, u16);

  selectStartupProfile();

  Services.prefs.setBoolPref("toolkit.profiles.newProfileSubmitted", false);
  Services.prefs.setBoolPref("toolkit.asyncshutdown.testing", true);
  await ProfileMetrics.init();

  await GleanPings.newProfile.testSubmission(
    () => {
      let value = Glean.profiles.secondsSinceInstall.testGetValue();
      Assert.greaterOrEqual(value, 300, "Should be at least 300 seconds");
      Assert.lessOrEqual(value, 360, "Should be no more than 360 seconds");
    },
    () => {
      AsyncShutdown.profileBeforeChange._trigger();
    }
  );
});
