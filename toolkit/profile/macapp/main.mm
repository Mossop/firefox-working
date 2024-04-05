// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/.

#include "application.ini.h"
#include "mozilla/Bootstrap.h"
#include "mozilla/StartupTimeline.h"
#import <Cocoa/Cocoa.h>

using namespace mozilla;

Bootstrap::UniquePtr gBootstrap;

int main(int argc, char * argv[]) {
  // TODO - Read this from the Info.plist
  putenv(strdup("XRE_PROFILE_PATH=/Users/dave/Library/Application Support/Firefox/Profiles/fkmak13q.Test"));
  putenv(strdup("XRE_PROFILE_LOCAL_PATH=/Users/dave/Library/Caches/Firefox/Profiles/fkmak13q.Test"));

  mozilla::TimeStamp start = mozilla::TimeStamp::Now();

  // TODO - Read this from the Info.plist or otherwise detect
  const char* realBinary = "/Users/dave/mozilla/build/trunk/obj-browser-opt-full/dist/Nightly.app/Contents/MacOS/firefox";
  auto bootstrapResult = mozilla::GetBootstrap(realBinary);

  if (bootstrapResult.isErr()) {
    printf("Couldn't load XPCOM.\n");
    return 255;
  }

  gBootstrap = bootstrapResult.unwrap();

  gBootstrap->XRE_SetBinaryPath(realBinary);

  // This will set this thread as the main thread.
  gBootstrap->NS_LogInit();

  gBootstrap->XRE_StartupTimelineRecord(mozilla::StartupTimeline::START, start);

  BootstrapConfig config;
  config.appData = &sAppData;
  config.appDataPath = "browser";

  return gBootstrap->XRE_main(argc, argv, config);
}
