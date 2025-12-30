/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

const { UnenrollmentCause } = ChromeUtils.importESModule(
  "resource://nimbus/lib/ExperimentManager.sys.mjs"
);
const { ProfilesDatastoreService } = ChromeUtils.importESModule(
  "moz-src:///toolkit/profile/ProfilesDatastoreService.sys.mjs"
);
const { RemoteSettingsExperimentLoader } = ChromeUtils.importESModule(
  "resource://nimbus/lib/RemoteSettingsExperimentLoader.sys.mjs"
);

const TEST_PREF = "nimbus.test-only.store-switch";
const TEST_USER_PREF = "nimbus.test-only.user-store-switch";

add_setup(function test_setup() {
  Services.fog.initializeFOG();
});

function setupTest({ ...args } = {}) {
  return NimbusTestUtils.setupTest({ ...args, clearTelemetry: true });
}

add_task(async function test_storeSwitch_unenrolls_experiments() {
  const { manager, cleanup } = await setupTest();

  const experiment1 = NimbusTestUtils.factories.recipe.withFeatureConfig(
    "exp1",
    { featureId: "testFeature" }
  );

  const experiment2 = NimbusTestUtils.factories.recipe.withFeatureConfig(
    "exp2",
    { featureId: "aboutwelcome" }
  );

  await manager.enroll(experiment1, "test");
  await manager.enroll(experiment2, "test");

  Assert.ok(manager.store.get("exp1").active, "exp1 should be active");
  Assert.ok(manager.store.get("exp2").active, "exp2 should be active");

  await manager.unenrollAll(UnenrollmentCause.StoreSwitch());

  Assert.ok(!manager.store.get("exp1").active, "exp1 should be inactive");
  Assert.ok(!manager.store.get("exp2").active, "exp2 should be inactive");

  await cleanup();
});

add_task(async function test_storeSwitch_resets_set_prefs() {
  const { manager, cleanup } = await setupTest();

  const experiment = NimbusTestUtils.factories.recipe.withFeatureConfig(
    "pref-test",
    {
      featureId: "prefFlips",
      value: {
        prefs: {
          [TEST_PREF]: {
            branch: "default",
            value: "experiment-value",
          },
        },
      },
    }
  );

  await manager.enroll(experiment, "test");

  Assert.equal(
    Services.prefs.getStringPref(TEST_PREF),
    "experiment-value",
    "Pref should be set by enrollment"
  );

  await manager.unenroll("pref-test", UnenrollmentCause.StoreSwitch());

  Assert.ok(
    !Services.prefs.prefHasUserValue(TEST_PREF),
    "Pref should be reset after unenrollment"
  );

  await cleanup();
});

add_task(async function test_storeSwitch_resets_user_prefs() {
  const { manager, cleanup } = await setupTest();

  const experiment = NimbusTestUtils.factories.recipe.withFeatureConfig(
    "user-pref-test",
    {
      featureId: "prefFlips",
      value: {
        prefs: {
          [TEST_USER_PREF]: {
            branch: "user",
            value: "user-experiment-value",
          },
        },
      },
    }
  );

  await manager.enroll(experiment, "test");

  Assert.equal(
    Services.prefs.getStringPref(TEST_USER_PREF),
    "user-experiment-value",
    "User pref should be set by enrollment"
  );

  await manager.unenroll("user-pref-test", UnenrollmentCause.StoreSwitch());

  Assert.ok(
    !Services.prefs.prefHasUserValue(TEST_USER_PREF),
    "User pref should be reset after unenrollment"
  );

  await cleanup();
});

add_task(async function test_storeSwitch_clears_sync_store() {
  const { manager, cleanup } = await setupTest();

  const SYNC_DATA_PREF_BRANCH = "nimbus.syncdatastore.";
  const SYNC_DEFAULTS_PREF_BRANCH = "nimbus.syncdefaultsstore.";
  const TEST_FEATURE_ID = "testFeature";

  Services.prefs.setStringPref(
    SYNC_DATA_PREF_BRANCH + TEST_FEATURE_ID,
    JSON.stringify({ enabled: true })
  );

  Services.prefs.setStringPref(
    SYNC_DEFAULTS_PREF_BRANCH + TEST_FEATURE_ID,
    JSON.stringify({ enabled: false })
  );

  Assert.ok(
    Services.prefs.prefHasUserValue(SYNC_DATA_PREF_BRANCH + TEST_FEATURE_ID),
    "Sync data pref should exist before clearing"
  );

  Assert.ok(
    Services.prefs.prefHasUserValue(
      SYNC_DEFAULTS_PREF_BRANCH + TEST_FEATURE_ID
    ),
    "Sync defaults pref should exist before clearing"
  );

  await manager.store.clearSyncStore();

  Assert.ok(
    !Services.prefs.prefHasUserValue(SYNC_DATA_PREF_BRANCH + TEST_FEATURE_ID),
    "Sync data pref should be cleared"
  );

  Assert.ok(
    !Services.prefs.prefHasUserValue(
      SYNC_DEFAULTS_PREF_BRANCH + TEST_FEATURE_ID
    ),
    "Sync defaults pref should be cleared"
  );

  await cleanup();
});

add_task(async function test_storeSwitch_unenrolls_rollouts() {
  const { manager, cleanup } = await setupTest();

  const rollout1Recipe = NimbusTestUtils.factories.recipe("rollout1", {
    isRollout: true,
    branches: [
      {
        slug: "rollout",
        ratio: 1,
        features: [
          {
            featureId: "testFeature",
            value: {},
          },
        ],
      },
    ],
  });

  const rollout2Recipe = NimbusTestUtils.factories.recipe("rollout2", {
    isRollout: true,
    branches: [
      {
        slug: "rollout",
        ratio: 1,
        features: [
          {
            featureId: "aboutwelcome",
            value: {},
          },
        ],
      },
    ],
  });

  await manager.enroll(rollout1Recipe, "test");
  await manager.enroll(rollout2Recipe, "test");

  Assert.ok(manager.store.get("rollout1").active, "rollout1 should be active");
  Assert.ok(manager.store.get("rollout2").active, "rollout2 should be active");

  await manager.unenrollAll(UnenrollmentCause.StoreSwitch());

  Assert.ok(
    !manager.store.get("rollout1").active,
    "rollout1 should be inactive"
  );
  Assert.ok(
    !manager.store.get("rollout2").active,
    "rollout2 should be inactive"
  );

  await cleanup();
});

add_task(async function test_storeSwitch_reinitializes_experiment_api() {
  const sandbox = sinon.createSandbox();

  sandbox
    .stub(RemoteSettingsExperimentLoader.prototype, "enable")
    .resolves();
  sandbox
    .stub(RemoteSettingsExperimentLoader.prototype, "disable")
    .callsFake(function () {
      this._enabled = false;
      this._updating = false;
      this._hasUpdatedOnce = false;
      this._updatingDeferred = Promise.withResolvers();
    });

  try {
    await ExperimentAPI.init();

    const oldManager = ExperimentAPI.manager;
    const oldStore = oldManager.store;
    const oldLoader = ExperimentAPI._rsLoader;

    sandbox.spy(oldStore._db, "finalize");

    const originalStoreID = await ProfilesDatastoreService.storeID;
    await ProfilesDatastoreService.switchStore(`${originalStoreID}-switched`);

    Assert.notStrictEqual(
      ExperimentAPI.manager,
      oldManager,
      "Store switch should create a fresh ExperimentManager"
    );
    Assert.notStrictEqual(
      ExperimentAPI.manager.store,
      oldStore,
      "Store switch should create a fresh ExperimentStore"
    );
    Assert.notStrictEqual(
      ExperimentAPI._rsLoader,
      oldLoader,
      "Store switch should create a fresh RS loader"
    );
    Assert.ok(
      oldStore._db.finalize.calledOnce,
      "The old Nimbus DB writer should be finalized before switching stores"
    );
    Assert.ok(
      RemoteSettingsExperimentLoader.prototype.disable.calledOnce,
      "The previous RS loader should be disabled before switching stores"
    );
  } finally {
    ExperimentAPI._resetForTests();
    sandbox.restore();
  }
});
