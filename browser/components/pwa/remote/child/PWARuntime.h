/* -*- Mode: C++; tab-width: 8; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set ts=8 sts=2 et sw=2 tw=80: */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef PWARuntime_h_
#define PWARuntime_h_

#include "mozilla/ipc/ProcessChild.h"
#include "mozilla/pwa/PWAChild.h"

namespace mozilla {
namespace pwa {

class PWARuntime : public PWAChild {
  friend class PWAProcessChild;

 public:
  PWARuntime();

  bool Init(base::ProcessId aParentPid, MessageLoop* aIOLoop, IPC::Channel* aChannel);

  void ActorDestroy(ActorDestroyReason aWhy) override;

 protected:
  PPWAWindowChild* AllocPPWAWindowChild() override;
  bool DeallocPPWAWindowChild(PPWAWindowChild* aActor) override;
};

class PWAProcessChild final : public mozilla::ipc::ProcessChild {
 public:
  explicit PWAProcessChild(ProcessId aParentPid, int aFd);

  bool Init(int aArgc, char* aArgv[]) override;
  void CleanUp() override;

 private:
  PWARuntime mChild;
  DISALLOW_COPY_AND_ASSIGN(PWAProcessChild);
};

} // namespace pwa
} // namespace mozilla

#endif
