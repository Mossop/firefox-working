/* -*- Mode: C++; tab-width: 8; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set ts=8 sts=2 et sw=2 tw=80: */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "PWARuntime.h"
#include "mozilla/ipc/IOThreadChild.h"
#include "PWAWindow.h"
#include "base/chrome_application_mac.h"

#import <Cocoa/Cocoa.h>

namespace mozilla {
namespace pwa {

PWAProcessChild::PWAProcessChild(ProcessId aParentPid, int aFd)
    : ProcessChild(aParentPid, aFd) {
  printf("*** PWAProcessChild started.\n");
}

bool
PWAProcessChild::Init(int aArgc, char* aArgv[]) {
  return mChild.Init(ParentPid(), ipc::IOThreadChild::message_loop(), ipc::IOThreadChild::channel());
}

void
PWAProcessChild::CleanUp() {}

PWARuntime::PWARuntime() {
}

bool
PWARuntime::Init(base::ProcessId aParentPid, MessageLoop* aIOLoop, IPC::Channel* aChannel) {
  if (!Open(aChannel, aParentPid, aIOLoop)) {
    printf("*** Failed to open channel.\n");
    return false;
  }

  printf("*** Opened channel.\n");
  if (!SendChildConnected()) {
    printf("*** Failed to send hello.\n");
  } else {
    printf("*** Sent hello.\n");
  }

  [CrApplication sharedApplication];
  [NSApp setActivationPolicy:NSApplicationActivationPolicyRegular];

  return true;
}

void
PWARuntime::ActorDestroy(ActorDestroyReason aWhy) {
  if (aWhy == AbnormalShutdown) {
    printf("*** Crashing.\n");
    ipc::ProcessChild::QuickExit();
  }

  XRE_ShutdownChildProcess();
}

PPWAWindowChild* PWARuntime::AllocPPWAWindowChild() {
  return new PWAWindow();
}

bool PWARuntime::DeallocPPWAWindowChild(PPWAWindowChild* aActor) {
  return true;
}

} // namespace pwa
} // namespace mozilla
