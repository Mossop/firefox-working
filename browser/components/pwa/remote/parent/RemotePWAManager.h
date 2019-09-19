/* -*- Mode: C++; tab-width: 8; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set ts=8 sts=2 et sw=2 tw=80: */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef RemotePWAManager_h_
#define RemotePWAManager_h_

#include "nsISupportsImpl.h"
#include "RemotePWAManager.h"
#include "mozilla/ipc/GeckoChildProcessHost.h"
#include "nsIObserver.h"

namespace mozilla {
namespace pwa{

class RemotePWA;

class PWAProcessHost final : public mozilla::ipc::GeckoChildProcessHost {
 public:
  explicit PWAProcessHost(int aFd);

  virtual void InitializeChannel() override;

  bool CanShutdown() override { return true; }

  void OnChannelConnected(int32_t peer_pid) override;

 private:
  int mFd;
  DISALLOW_COPY_AND_ASSIGN(PWAProcessHost);
};

class RemotePWAManager final : public nsIObserver {
 public:
  NS_DECL_THREADSAFE_ISUPPORTS
  NS_DECL_NSIOBSERVER

  RemotePWAManager();
 private:
  ~RemotePWAManager();

  void StartListen();
  void Listen();

  nsTArray<RefPtr<RemotePWA>> mPWAs;
  int mListenerSocket;
};

} // namespace pwa
} // namespace mozilla

void
NS_InitPWAManager();

#endif
