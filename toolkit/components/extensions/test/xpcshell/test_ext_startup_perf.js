/* -*- Mode: indent-tabs-mode: nil; js-indent-level: 2 -*- */
/* vim: set sts=2 sw=2 et tw=80: */
"use strict";

const STARTUP_APIS = ["backgroundPage"];

const STARTUP_MODULES = new Set([
  "moz-src:///toolkit/components/extensions/Extension.jsm",
  "moz-src:///toolkit/components/extensions/ExtensionCommon.jsm",
  "moz-src:///toolkit/components/extensions/ExtensionParent.jsm",
  // FIXME: This is only loaded at startup for new extension installs.
  // Otherwise the data comes from the startup cache. We should test for
  // this.
  "moz-src:///toolkit/components/extensions/ExtensionPermissions.jsm",
  "moz-src:///toolkit/components/extensions/ExtensionProcessScript.jsm",
  "moz-src:///toolkit/components/extensions/ExtensionUtils.jsm",
  "moz-src:///toolkit/components/extensions/ExtensionTelemetry.jsm",
]);

if (!Services.prefs.getBoolPref("extensions.webextensions.remote")) {
  STARTUP_MODULES.add("moz-src:///toolkit/components/extensions/ExtensionChild.jsm");
  STARTUP_MODULES.add("moz-src:///toolkit/components/extensions/ExtensionPageChild.jsm");
}

if (AppConstants.MOZ_APP_NAME == "thunderbird") {
  // Imported via mail/components/extensions/processScript.js.
  STARTUP_MODULES.add("moz-src:///toolkit/components/extensions/ExtensionChild.jsm");
  STARTUP_MODULES.add("moz-src:///toolkit/components/extensions/ExtensionContent.jsm");
  STARTUP_MODULES.add("moz-src:///toolkit/components/extensions/ExtensionPageChild.jsm");
}

AddonTestUtils.init(this);

// Tests that only the minimal set of API scripts and modules are loaded at
// startup for a simple extension.
add_task(async function test_loaded_scripts() {
  await ExtensionTestUtils.startAddonManager();

  let extension = ExtensionTestUtils.loadExtension({
    useAddonManager: "temporary",
    background() {},
    manifest: {},
  });

  await extension.startup();

  const { apiManager } = ExtensionParent;

  const loadedAPIs = Array.from(apiManager.modules.values())
    .filter(m => m.loaded || m.asyncLoaded)
    .map(m => m.namespaceName);

  deepEqual(
    loadedAPIs.sort(),
    STARTUP_APIS,
    "No extra APIs should be loaded at startup for a simple extension"
  );

  let loadedModules = Cu.loadedJSModules
    .concat(Cu.loadedESModules)
    .filter(url => url.startsWith("resource://gre/modules/Extension"));

  deepEqual(
    loadedModules.sort(),
    Array.from(STARTUP_MODULES).sort(),
    "No extra extension modules should be loaded at startup for a simple extension"
  );

  await extension.unload();
});
