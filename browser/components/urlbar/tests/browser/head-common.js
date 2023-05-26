ChromeUtils.defineESModuleGetters(this, {
  PlacesTestUtils: "resource://testing-common/PlacesTestUtils.sys.mjs",
  PlacesUtils: "moz-src:///toolkit/components/places/PlacesUtils.sys.mjs",
  Preferences: "moz-src:///toolkit/modules/Preferences.sys.mjs",
  UrlbarProvider: "moz-src:///browser/components/urlbar/UrlbarUtils.sys.mjs",
  UrlbarProvidersManager: "moz-src:///browser/components/urlbar/UrlbarProvidersManager.sys.mjs",
  UrlbarResult: "moz-src:///browser/components/urlbar/UrlbarResult.sys.mjs",
  UrlbarTokenizer: "moz-src:///browser/components/urlbar/UrlbarTokenizer.sys.mjs",
  UrlbarUtils: "moz-src:///browser/components/urlbar/UrlbarUtils.sys.mjs",
});

XPCOMUtils.defineLazyModuleGetters(this, {
  HttpServer: "resource://testing-common/httpd.js",
});

XPCOMUtils.defineLazyGetter(this, "TEST_BASE_URL", () =>
  getRootDirectory(gTestPath).replace(
    "chrome://mochitests/content",
    "https://example.com"
  )
);

XPCOMUtils.defineLazyServiceGetter(
  this,
  "clipboardHelper",
  "@mozilla.org/widget/clipboardhelper;1",
  "nsIClipboardHelper"
);

XPCOMUtils.defineLazyGetter(this, "UrlbarTestUtils", () => {
  const { UrlbarTestUtils: module } = ChromeUtils.importESModule(
    "resource://testing-common/UrlbarTestUtils.sys.mjs"
  );
  module.init(this);
  registerCleanupFunction(() => module.uninit());
  return module;
});

XPCOMUtils.defineLazyGetter(this, "SearchTestUtils", () => {
  const { SearchTestUtils: module } = ChromeUtils.importESModule(
    "resource://testing-common/SearchTestUtils.sys.mjs"
  );
  module.init(this);
  return module;
});

/**
 * Initializes an HTTP Server, and runs a task with it.
 *
 * @param {object} details {scheme, host, port}
 * @param {Function} taskFn The task to run, gets the server as argument.
 */
async function withHttpServer(
  details = { scheme: "http", host: "localhost", port: -1 },
  taskFn
) {
  let server = new HttpServer();
  let url = `${details.scheme}://${details.host}:${details.port}`;
  try {
    info(`starting HTTP Server for ${url}`);
    try {
      server.start(details.port);
      details.port = server.identity.primaryPort;
      server.identity.setPrimary(details.scheme, details.host, details.port);
    } catch (ex) {
      throw new Error("We can't launch our http server successfully. " + ex);
    }
    Assert.ok(
      server.identity.has(details.scheme, details.host, details.port),
      `${url} is listening.`
    );
    try {
      await taskFn(server);
    } catch (ex) {
      throw new Error("Exception in the task function " + ex);
    }
  } finally {
    server.identity.remove(details.scheme, details.host, details.port);
    try {
      await new Promise(resolve => server.stop(resolve));
    } catch (ex) {}
    server = null;
  }
}

/**
 * Updates the Top Sites feed.
 *
 * @param {Function} condition
 *   A callback that returns true after Top Sites are successfully updated.
 * @param {boolean} searchShortcuts
 *   True if Top Sites search shortcuts should be enabled.
 */
async function updateTopSites(condition, searchShortcuts = false) {
  // Toggle the pref to clear the feed cache and force an update.
  await SpecialPowers.pushPrefEnv({
    set: [
      [
        "browser.newtabpage.activity-stream.discoverystream.endpointSpocsClear",
        "",
      ],
      ["browser.newtabpage.activity-stream.feeds.system.topsites", false],
      ["browser.newtabpage.activity-stream.feeds.system.topsites", true],
      [
        "browser.newtabpage.activity-stream.improvesearch.topSiteSearchShortcuts",
        searchShortcuts,
      ],
    ],
  });

  // Wait for the feed to be updated.
  await TestUtils.waitForCondition(() => {
    let sites = AboutNewTab.getTopSites();
    return condition(sites);
  }, "Waiting for top sites to be updated");
}

/**
 * Asserts a search term is in the url bar and state values are
 * what they should be.
 *
 * @param {string} searchString
 *   String that should be matched in the url bar.
 * @param {object | null} options
 *   Options for the assertions.
 * @param {Window | null} options.window
 *   Window to use for tests.
 * @param {string | null} options.pageProxyState
 *   The pageproxystate that should be expected. Defaults to "valid".
 * @param {string | null} options.userTypedValue
 *   The userTypedValue that should be expected. Defaults to null.
 */
function assertSearchStringIsInUrlbar(
  searchString,
  { win = window, pageProxyState = "valid", userTypedValue = null } = {}
) {
  Assert.equal(
    win.gURLBar.value,
    searchString,
    `Search string should be the urlbar value.`
  );
  Assert.equal(
    win.gBrowser.selectedBrowser.searchTerms,
    searchString,
    `Search terms should match.`
  );
  Assert.equal(
    win.gBrowser.userTypedValue,
    userTypedValue,
    "userTypedValue should match."
  );
  Assert.equal(
    win.gURLBar.getAttribute("pageproxystate"),
    pageProxyState,
    "Pageproxystate should match."
  );
}
