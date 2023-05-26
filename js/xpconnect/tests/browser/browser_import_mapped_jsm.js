/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

"use strict";

// Verify Cu.import and ChromeUtils.import works for JSM URL even after
// ESM-ification, and any not-in-tree consumer doesn't break.
//
// This test modules that's commonly used by not-in-tree consumers, such as
// privilege extensions and AutoConfigs.

const JSMs = [
  "moz-src:///browser/modules/AboutNewTab.jsm",
  "moz-src:///browser/components/customizableui/CustomizableUI.jsm",
  "moz-src:///browser/components/uitour/UITour.jsm",
  "moz-src:///browser/components/distribution.js",
  "moz-src:///toolkit/mozapps/extensions/AddonManager.jsm",
  "resource://gre/modules/AppConstants.jsm",
  "moz-src:///toolkit/components/asyncshutdown/AsyncShutdown.jsm",
  "moz-src:///toolkit/modules/Console.jsm",
  "moz-src:///toolkit/modules/FileUtils.jsm",
  "moz-src:///toolkit/mozapps/extensions/LightweightThemeManager.jsm",
  "moz-src:///netwerk/base/NetUtil.jsm",
  "moz-src:///toolkit/components/places/PlacesUtils.jsm",
  "moz-src:///intl/locale/PluralForm.jsm",
  "moz-src:///toolkit/modules/PrivateBrowsingUtils.jsm",
  "moz-src:///toolkit/modules/Timer.jsm",
  "moz-src:///js/xpconnect/loader/XPCOMUtils.jsm",
  "moz-src:///toolkit/mozapps/extensions/internal/XPIDatabase.jsm",
  "moz-src:///toolkit/mozapps/extensions/internal/XPIProvider.jsm",
  "moz-src:///toolkit/mozapps/extensions/internal/XPIInstall.jsm",
  "moz-src:///browser/modules/BrowserWindowTracker.jsm",
];

if (AppConstants.platform === "win") {
  JSMs.push("resource:///modules/WindowsJumpLists.jsm");
}

add_task(async function test_chrome_utils_import() {
  for (const file of JSMs) {
    try {
      ChromeUtils.import(file);
      ok(true, `Imported ${file}`);
    } catch (e) {
      ok(false, `Failed to import ${file}`);
    }
  }
});

add_task(async function test_cu_import() {
  for (const file of JSMs) {
    try {
      // eslint-disable-next-line mozilla/use-chromeutils-import
      Cu.import(file, {});
      ok(true, `Imported ${file}`);
    } catch (e) {
      ok(false, `Failed to import ${file}`);
    }
  }
});
