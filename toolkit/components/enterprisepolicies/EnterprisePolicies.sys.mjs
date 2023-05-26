/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

export function EnterprisePolicies() {
  // eslint-disable-next-line mozilla/use-services
  const appinfo = Cc["@mozilla.org/xre/app-info;1"].getService(
    Ci.nsIXULRuntime
  );
  if (appinfo.processType == appinfo.PROCESS_TYPE_DEFAULT) {
    const { EnterprisePoliciesManager } = ChromeUtils.importESModule(
      "moz-src:///toolkit/components/enterprisepolicies/EnterprisePoliciesParent.sys.mjs"
    );
    return new EnterprisePoliciesManager();
  }
  const { EnterprisePoliciesManagerContent } = ChromeUtils.importESModule(
    "moz-src:///toolkit/components/enterprisepolicies/EnterprisePoliciesContent.sys.mjs"
  );
  return new EnterprisePoliciesManagerContent();
}
