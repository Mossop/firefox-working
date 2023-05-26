function run_test() {
  // Existing module.
  Assert.ok(Cu.isModuleLoaded("moz-src:///netwerk/base/NetUtil.jsm"),
            "isModuleLoaded returned correct value for non-loaded module");
  ChromeUtils.import("moz-src:///netwerk/base/NetUtil.jsm");
  Assert.ok(Cu.isModuleLoaded("moz-src:///netwerk/base/NetUtil.jsm"),
            "isModuleLoaded returned true after loading that module");
  Cu.unload("moz-src:///netwerk/base/NetUtil.jsm");
  Assert.ok(!Cu.isModuleLoaded("moz-src:///netwerk/base/NetUtil.jsm"),
            "isModuleLoaded returned false after unloading that module");

  // Non-existing module
  Assert.ok(!Cu.isModuleLoaded("resource://gre/modules/non-existing-module.jsm"),
            "isModuleLoaded returned correct value for non-loaded module");
  try {
    ChromeUtils.import("resource://gre/modules/non-existing-module.jsm");
    Assert.ok(false,
              "Should have thrown while trying to load a non existing file");
  } catch (ex) {}
  Assert.ok(!Cu.isModuleLoaded("resource://gre/modules/non-existing-module.jsm"),
            "isModuleLoaded returned correct value for non-loaded module");
}
