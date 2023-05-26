"use strict";

/* exported createHttpServer, promiseConsoleOutput, assertPersistentListeners  */

var { XPCOMUtils } = ChromeUtils.importESModule(
  "moz-src:///js/xpconnect/loader/XPCOMUtils.sys.mjs"
);
const { AppConstants } = ChromeUtils.importESModule(
  "resource://gre/modules/AppConstants.sys.mjs"
);

// eslint-disable-next-line no-unused-vars
ChromeUtils.defineESModuleGetters(this, {
  FileUtils: "moz-src:///toolkit/modules/FileUtils.sys.mjs",
  TestUtils: "resource://testing-common/TestUtils.sys.mjs",
});

XPCOMUtils.defineLazyModuleGetters(this, {
  Extension: "moz-src:///toolkit/components/extensions/Extension.jsm",
  ExtensionData: "moz-src:///toolkit/components/extensions/Extension.jsm",
  ExtensionTestUtils: "resource://testing-common/ExtensionXPCShellUtils.jsm",
  HttpServer: "resource://testing-common/httpd.js",
  NetUtil: "moz-src:///netwerk/base/NetUtil.jsm",
  Schemas: "moz-src:///toolkit/components/extensions/Schemas.jsm",
});

ExtensionTestUtils.init(this);

// Persistent Listener test functionality
const { assertPersistentListeners } = ExtensionTestUtils.testAssertions;

/**
 * Creates a new HttpServer for testing, and begins listening on the
 * specified port. Automatically shuts down the server when the test
 * unit ends.
 *
 * @param {integer} [port]
 *        The port to listen on. If omitted, listen on a random
 *        port. The latter is the preferred behavior.
 *
 * @returns {HttpServer}
 */
function createHttpServer(port = -1) {
  let server = new HttpServer();
  server.start(port);

  registerCleanupFunction(() => {
    return new Promise(resolve => {
      server.stop(resolve);
    });
  });

  return server;
}

var promiseConsoleOutput = async function(task) {
  const DONE = `=== console listener ${Math.random()} done ===`;

  let listener;
  let messages = [];
  let awaitListener = new Promise(resolve => {
    listener = msg => {
      if (msg == DONE) {
        resolve();
      } else {
        void (msg instanceof Ci.nsIConsoleMessage);
        messages.push(msg);
      }
    };
  });

  Services.console.registerListener(listener);
  try {
    let result = await task();

    Services.console.logStringMessage(DONE);
    await awaitListener;

    return { messages, result };
  } finally {
    Services.console.unregisterListener(listener);
  }
};
