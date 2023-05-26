"use strict";
const { XPCOMUtils } = ChromeUtils.importESModule(
  "moz-src:///js/xpconnect/loader/XPCOMUtils.sys.mjs"
);

function clearCache() {
  const cacheStorageSrv = Cc[
    "@mozilla.org/netwerk/cache-storage-service;1"
  ].getService(Ci.nsICacheStorageService);
  cacheStorageSrv.clear();
}

addMessageListener("teardown", function() {
  clearCache();
  sendAsyncMessage("teardown-complete");
});
