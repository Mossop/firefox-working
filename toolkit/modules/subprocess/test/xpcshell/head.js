"use strict";

var { XPCOMUtils } = ChromeUtils.importESModule(
  "moz-src:///js/xpconnect/loader/XPCOMUtils.sys.mjs"
);
const { AppConstants } = ChromeUtils.importESModule(
  "resource://gre/modules/AppConstants.sys.mjs"
);

// eslint-disable-next-line no-unused-vars
ChromeUtils.defineESModuleGetters(this, {
  Subprocess: "moz-src:///toolkit/modules/subprocess/Subprocess.sys.mjs",
});
