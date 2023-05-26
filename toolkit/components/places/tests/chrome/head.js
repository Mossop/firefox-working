var { XPCOMUtils } = ChromeUtils.importESModule(
  "moz-src:///js/xpconnect/loader/XPCOMUtils.sys.mjs"
);

ChromeUtils.defineESModuleGetters(this, {
  PlacesTestUtils: "resource://testing-common/PlacesTestUtils.sys.mjs",
  PlacesUtils: "moz-src:///toolkit/components/places/PlacesUtils.sys.mjs",
});
