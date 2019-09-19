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

class PWARuntime final : public PWAChild, public mozilla::ipc::ProcessChild {
 public:
  PWARuntime(base::ProcessId aParentPid, int aFd);
  NS_INLINE_DECL_THREADSAFE_REFCOUNTING(PWARuntime, final)

  bool Init(int aArgc, char* aArgv[]) override;
  bool Init(base::ProcessId aParentPid, MessageLoop* aIOLoop, IPC::Channel* aChannel);

  void ActorDestroy(ActorDestroyReason aWhy) override;
  void CleanUp() override;

 protected:
  PPWAWindowChild* AllocPPWAWindowChild(DesktopIntRect aOuterBounds, LayoutDeviceIntRect aInnerBounds, nsBorderStyle aBorderStyle) override;

 private:
  ~PWARuntime() = default;
};

} // namespace pwa
} // namespace mozilla

#endif
