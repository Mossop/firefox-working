/* -*- Mode: C++; tab-width: 8; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set ts=8 sts=2 et sw=2 tw=80: */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef RemotePWA_h_
#define RemotePWA_h_

#include "mozilla/pwa/PWAParent.h"
#include "RemoteWindow.h"
#include "RemotePWAManager.h"

namespace mozilla {
namespace pwa {

class RemotePWA : public PWAParent {
 public:
  RemotePWA(nsACString& uuid, uint32_t remoteId, int child);
  NS_INLINE_DECL_THREADSAFE_REFCOUNTING(RemotePWA)

  void Shutdown();

  already_AddRefed<RemoteWindow> CreateRemoteWindow();
  uint32_t GetRemoteId() { return mRemoteId; };

 protected:
  PPWAWindowParent* AllocPPWAWindowParent() override;
  bool DeallocPPWAWindowParent(PPWAWindowParent* aActor) override;

  mozilla::ipc::IPCResult RecvChildConnected() override;

 private:
  ~RemotePWA();

  void Init();
  void Connect();

  nsCString mUuid;
  uint32_t mRemoteId;
  PWAProcessHost mHost;
  nsTArray<RefPtr<RemoteWindow>> mWindows;
};

} // namespace pwa
} // namespace mozilla

#endif
