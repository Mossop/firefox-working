/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const { BaseAction } = ChromeUtils.import(
  "resource://normandy/actions/BaseAction.jsm"
);
const { XPCOMUtils } = ChromeUtils.import(
  "resource://gre/modules/XPCOMUtils.jsm"
);
const { TelemetryEnvironment } = XPCOMUtils.lazyImport(
  "resource://gre/modules/TelemetryEnvironment.jsm"
);
const { PreferenceRollouts } = XPCOMUtils.lazyImport(
  "resource://normandy/lib/PreferenceRollouts.jsm"
);
const { PrefUtils } = XPCOMUtils.lazyImport(
  "resource://normandy/lib/PrefUtils.jsm"
);
const { ActionSchemas } = XPCOMUtils.lazyImport(
  "resource://normandy/actions/schemas/index.js"
);
const { TelemetryEvents } = XPCOMUtils.lazyImport(
  "resource://normandy/lib/TelemetryEvents.jsm"
);

var EXPORTED_SYMBOLS = ["PreferenceRollbackAction"];

class PreferenceRollbackAction extends BaseAction {
  get schema() {
    return ActionSchemas["preference-rollback"];
  }

  async _run(recipe) {
    const { rolloutSlug } = recipe.arguments;
    const rollout = await PreferenceRollouts.get(rolloutSlug);

    if (!rollout) {
      this.log.debug(`Rollback ${rolloutSlug} not applicable, skipping`);
      return;
    }

    switch (rollout.state) {
      case PreferenceRollouts.STATE_ACTIVE: {
        this.log.info(`Rolling back ${rolloutSlug}`);
        rollout.state = PreferenceRollouts.STATE_ROLLED_BACK;
        for (const { preferenceName, previousValue } of rollout.preferences) {
          PrefUtils.setPref("default", preferenceName, previousValue);
        }
        await PreferenceRollouts.update(rollout);
        TelemetryEvents.sendEvent(
          "unenroll",
          "preference_rollback",
          rolloutSlug,
          {
            reason: "rollback",
            enrollmentId:
              rollout.enrollmentId || TelemetryEvents.NO_ENROLLMENT_ID_MARKER,
          }
        );
        TelemetryEnvironment.setExperimentInactive(rolloutSlug);
        break;
      }
      case PreferenceRollouts.STATE_ROLLED_BACK: {
        // The rollout has already been rolled back, so nothing to do here.
        break;
      }
      case PreferenceRollouts.STATE_GRADUATED: {
        // graduated rollouts can't be rolled back
        TelemetryEvents.sendEvent(
          "unenrollFailed",
          "preference_rollback",
          rolloutSlug,
          {
            reason: "graduated",
            enrollmentId:
              rollout.enrollmentId || TelemetryEvents.NO_ENROLLMENT_ID_MARKER,
          }
        );
        throw new Error(
          `Cannot rollback already graduated rollout ${rolloutSlug}`
        );
      }
      default: {
        throw new Error(
          `Unexpected state when rolling back ${rolloutSlug}: ${rollout.state}`
        );
      }
    }
  }

  async _finalize() {
    await PreferenceRollouts.saveStartupPrefs();
  }
}
