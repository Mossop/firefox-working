var { XPCOMUtils } = ChromeUtils.importESModule(
  "moz-src:///js/xpconnect/loader/XPCOMUtils.sys.mjs"
);
var { sinon } = ChromeUtils.importESModule(
  "resource://testing-common/Sinon.sys.mjs"
);

XPCOMUtils.defineLazyGetter(this, "FxAccountsCommon", function() {
  return ChromeUtils.import("moz-src:///services/fxaccounts/FxAccountsCommon.js");
});

do_get_profile(); // fxa needs a profile directory for storage.
