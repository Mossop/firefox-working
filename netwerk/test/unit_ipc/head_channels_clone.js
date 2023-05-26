/* import-globals-from ../unit/head_channels.js */
// Load standard base class for network tests into child process
//

var { NetUtil } = ChromeUtils.import("moz-src:///netwerk/base/NetUtil.jsm");
var { XPCOMUtils } = ChromeUtils.importESModule(
  "moz-src:///js/xpconnect/loader/XPCOMUtils.sys.mjs"
);

load("../unit/head_channels.js");
