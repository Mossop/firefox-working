/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Interface to a dedicated thread handling readability parsing.
 */

const { BasePromiseWorker } = ChromeUtils.import(
  "moz-src:///toolkit/components/promiseworker/PromiseWorker.jsm"
);

export var ReaderWorker = new BasePromiseWorker(
  "moz-src:///toolkit/components/reader/ReaderWorker.js"
);
