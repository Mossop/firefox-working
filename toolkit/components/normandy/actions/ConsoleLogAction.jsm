/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const { BaseAction } = ChromeUtils.import(
  "resource://normandy/actions/BaseAction.jsm"
);
const { XPCOMUtils } = ChromeUtils.import(
  "resource://gre/modules/XPCOMUtils.jsm"
);
const { ActionSchemas } = XPCOMUtils.lazyImport(
  "resource://normandy/actions/schemas/index.js"
);

var EXPORTED_SYMBOLS = ["ConsoleLogAction"];

class ConsoleLogAction extends BaseAction {
  get schema() {
    return ActionSchemas["console-log"];
  }

  async _run(recipe) {
    this.log.info(recipe.arguments.message);
  }
}
