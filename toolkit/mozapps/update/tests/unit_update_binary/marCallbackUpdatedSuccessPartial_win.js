/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/
 */

/* Partial MAR apply success test where the callback binary is the file being
 * patched by the update. This exercises the code path where the updater must
 * lock the newly-written callback executable before it finishes writing it, to
 * prevent a new Firefox instance from launching from the partially-written
 * binary mid-update.
 *
 * Note: setupUpdaterTest copies TestAUSHelper to exe0.exe as the callback,
 * but the gTestFilesPartialSuccess setup subsequently overwrites exe0.exe with
 * complete.exe as the patch source, which is what the partial MAR expects.
 *
 * checkCallbackLog() is intentionally not called because the callback binary
 * is replaced with partial.exe content by the MAR, which is not a working
 * TestAUSHelper executable and therefore does not write callback.log. */

async function run_test() {
  if (!setupTestCommon()) {
    return;
  }
  gTestFiles = gTestFilesPartialSuccess;
  gTestDirs = gTestDirsPartialSuccess;
  // Make exe0.exe the callback so that the file being patched by the MAR is
  // the same file the updater will lock and relaunch as the callback.
  gCallbackApp = "exe0.exe";
  await setupUpdaterTest(FILE_PARTIAL_MAR, false);
  runUpdate(STATE_SUCCEEDED, false, 0, true);
  await checkPostUpdateAppLog();
  await testPostUpdateProcessing();
  checkPostUpdateRunningFile(true);
  checkFilesAfterUpdateSuccess(getApplyDirFile);
  checkUpdateLogContents(LOG_PARTIAL_SUCCESS);
  await waitForUpdateXMLFiles();
  await checkUpdateManager(STATE_NONE, false, STATE_SUCCEEDED, 0, 1);
  // checkCallbackLog() is skipped (see comment above), so its usual
  // continuation into waitForFilesInUse() -> doTestFinish() never happens.
  // Call it directly to signal that the test is done.
  await waitForFilesInUse();
}
