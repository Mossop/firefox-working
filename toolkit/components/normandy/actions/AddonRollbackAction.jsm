/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const { XPCOMUtils } = ChromeUtils.import(
  "resource://gre/modules/XPCOMUtils.jsm"
);
const { BaseAction } = ChromeUtils.import(
  "resource://normandy/actions/BaseAction.jsm"
);

const { ActionSchemas } = XPCOMUtils.lazyImport(
  "resource://normandy/actions/schemas/index.js"
);
const { AddonManager } = XPCOMUtils.lazyImport(
  "resource://gre/modules/AddonManager.jsm"
);
const { AddonRollouts } = XPCOMUtils.lazyImport(
  "resource://normandy/lib/AddonRollouts.jsm"
);
const { TelemetryEnvironment } = XPCOMUtils.lazyImport(
  "resource://gre/modules/TelemetryEnvironment.jsm"
);
const { TelemetryEvents } = XPCOMUtils.lazyImport(
  "resource://normandy/lib/TelemetryEvents.jsm"
);

var EXPORTED_SYMBOLS = ["AddonRollbackAction"];

class AddonRollbackAction extends BaseAction {
  get schema() {
    return ActionSchemas["addon-rollback"];
  }

  async _run(recipe) {
    const { rolloutSlug } = recipe.arguments;
    const rollout = await AddonRollouts.get(rolloutSlug);

    if (!rollout) {
      this.log.debug(`Rollback ${rolloutSlug} not applicable, skipping`);
      return;
    }

    switch (rollout.state) {
      case AddonRollouts.STATE_ACTIVE: {
        await AddonRollouts.update({
          ...rollout,
          state: AddonRollouts.STATE_ROLLED_BACK,
        });

        const addon = await AddonManager.getAddonByID(rollout.addonId);
        if (addon) {
          try {
            await addon.uninstall();
          } catch (err) {
            TelemetryEvents.sendEvent(
              "unenrollFailed",
              "addon_rollback",
              rolloutSlug,
              {
                reason: "uninstall-failed",
                enrollmentId:
                  rollout.enrollmentId ||
                  TelemetryEvents.NO_ENROLLMENT_ID_MARKER,
              }
            );
            throw err;
          }
        } else {
          this.log.warn(
            `Could not uninstall addon ${
              rollout.addonId
            } for rollback ${rolloutSlug}: it is not installed.`
          );
        }

        TelemetryEvents.sendEvent("unenroll", "addon_rollback", rolloutSlug, {
          reason: "rollback",
          enrollmentId:
            rollout.enrollmentId || TelemetryEvents.NO_ENROLLMENT_ID_MARKER,
        });
        TelemetryEnvironment.setExperimentInactive(rolloutSlug);
        break;
      }

      case AddonRollouts.STATE_ROLLED_BACK: {
        return; // Do nothing
      }

      default: {
        throw new Error(
          `Unexpected state when rolling back ${rolloutSlug}: ${rollout.state}`
        );
      }
    }
  }
}
