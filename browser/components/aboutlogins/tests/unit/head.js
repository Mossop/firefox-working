/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

const { LoginTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/LoginTestUtils.sys.mjs"
);
const { LoginHelper } = ChromeUtils.importESModule(
  "moz-src:///toolkit/components/passwordmgr/LoginHelper.sys.mjs"
);

const TestData = LoginTestUtils.testData;
const newPropertyBag = LoginHelper.newPropertyBag;

/**
 * All the tests are implemented with add_task, this starts them automatically.
 */
function run_test() {
  do_get_profile();
  run_next_test();
}
