// eslint-disable-next-line mozilla/lazy-getter-object-name
const lazy = ChromeUtils.defineESModuleGetters(
  {},
  /** {const} */ {
    DefaultBrowserCheck: "resource:///modules/BrowserGlue.sys.mjs",
  }
);

lazy.DefaultBrowserCheck.startupIdleTaskPromise;

const test = ChromeUtils.defineLazyGetter({}, "foo", () => "hello");
