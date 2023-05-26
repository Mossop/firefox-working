/* Any copyright is dedicated to the Public Domain.
   http://creativecommons.org/publicdomain/zero/1.0/ */

Services.scriptloader.loadSubScript(
  "chrome://global/content/globalOverlay.js",
  this
);
Services.scriptloader.loadSubScript(
  "chrome://browser/content/utilityOverlay.js",
  this
);

ChromeUtils.defineESModuleGetters(this, {
  BrowserTestUtils: "resource://testing-common/BrowserTestUtils.sys.mjs",
  PlacesTestUtils: "resource://testing-common/PlacesTestUtils.sys.mjs",
});

ChromeUtils.defineESModuleGetters(window, {
  PlacesUIUtils: "moz-src:///browser/components/places/PlacesUIUtils.sys.mjs",
  PlacesUtils: "moz-src:///toolkit/components/places/PlacesUtils.sys.mjs",
  PlacesTransactions: "moz-src:///toolkit/components/places/PlacesTransactions.sys.mjs",
});

var { XPCOMUtils } = ChromeUtils.importESModule(
  "moz-src:///js/xpconnect/loader/XPCOMUtils.sys.mjs"
);
XPCOMUtils.defineLazyScriptGetter(
  window,
  ["PlacesTreeView"],
  "chrome://browser/content/places/treeView.js"
);
XPCOMUtils.defineLazyScriptGetter(
  window,
  ["PlacesInsertionPoint", "PlacesController", "PlacesControllerDragHelper"],
  "chrome://browser/content/places/controller.js"
);
