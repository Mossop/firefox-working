/* -*- Mode: C++; tab-width: 8; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set ts=8 sts=2 et sw=2 tw=80: */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "RemotePWAManager.h"
#include "RemotePWA.h"
#include "mozilla/UniquePtr.h"
#include "nsThreadUtils.h"
#include "nsIWidget.h"
#include "nsIObserverService.h"

#include <sys/socket.h>
#include <sys/un.h>
#include <servers/bootstrap.h>

using namespace mozilla;

namespace mozilla {
namespace pwa {

PWAProcessHost::PWAProcessHost(int aFd)
    : GeckoChildProcessHost(GeckoProcessType_PWA),
      mFd(aFd) {
}

void
PWAProcessHost::InitializeChannel() {
  CreateChannel(mFd);

  MonitorAutoLock lock(mMonitor);
  mProcessState = CHANNEL_INITIALIZED;
  lock.Notify();
}

void
PWAProcessHost::OnChannelConnected(int32_t peer_pid) {
  MOZ_ASSERT(!NS_IsMainThread());
  printf("*** Client connected!\n");

  GeckoChildProcessHost::OnChannelConnected(peer_pid);

  GetChannel()->CloseClientFileDescriptor();
}

RefPtr<RemotePWAManager> sManager;

NS_IMPL_ISUPPORTS(RemotePWAManager, nsIObserver)

RemotePWAManager::RemotePWAManager() {
  StartListen();

  nsCOMPtr<nsIObserverService> observerService =
      mozilla::services::GetObserverService();
  observerService->AddObserver(this, NS_XPCOM_SHUTDOWN_OBSERVER_ID, false);
}

RemotePWAManager::~RemotePWAManager() {
}

NS_IMETHODIMP
RemotePWAManager::Observe(nsISupports* aSubject, const char* aTopic,
                          const char16_t* aData) {
  if (!nsCRT::strcmp(aTopic, NS_XPCOM_SHUTDOWN_OBSERVER_ID)) {
    printf("*** XPCOM shutdown.\n");
    int socket = mListenerSocket;
    mListenerSocket = -1;
    close(socket);

    sManager = nullptr;

    for (unsigned long i = 0; i < mPWAs.Length(); i++) {
      mPWAs[i]->Shutdown();
    }

    mPWAs.Clear();
  }

  return NS_OK;
}

// Starts a thread to wait for a new connection.
void
RemotePWAManager::StartListen() {
  RefPtr<Runnable> listener = mozilla::NewRunnableMethod("PWAListener", this, &RemotePWAManager::Listen);
  nsCOMPtr<nsIThread> thread;
  NS_NewNamedThread(NS_LITERAL_CSTRING("PWAListener"), getter_AddRefs(thread), listener);

  nsCOMPtr<nsIObserverService> os = mozilla::services::GetObserverService();
  os->AddObserver(this, "quit-application", false);
}

void
RemotePWAManager::Listen() {
  nsCOMPtr<nsIFile> socketFile;
  nsresult rv = NS_NewLocalFile(NS_LITERAL_STRING("/Users/dave/Library/Caches/Firefox/pwa.sock"), false, getter_AddRefs(socketFile));
  NS_ENSURE_SUCCESS_VOID(rv);

  socketFile->Remove(true);

  printf("*** Creating socket.\n");
  mListenerSocket = socket(AF_UNIX, SOCK_STREAM, 0);
  if (mListenerSocket == -1) {
    perror("Creating socket");
    return;
  }

  struct sockaddr_un addr;
  memset(&addr, 0, sizeof(struct sockaddr_un));
  addr.sun_family = AF_UNIX;
  strncpy(addr.sun_path, socketFile->NativePath().get(), sizeof(addr.sun_path) - 1);

  printf("*** Binding.\n");
  if (bind(mListenerSocket, (const sockaddr*)&addr, sizeof(addr)) == -1) {
    perror("Binding to socket");
    return;
  }

  if (listen(mListenerSocket, 5) == -1) {
    perror("Listening");
    return;
  }

  while (mListenerSocket > 0) {
    int child = accept(mListenerSocket, NULL, NULL);
    if (child == -1) {
      perror("Accepting connection");
      continue;
    }

    uint32_t len;
    if (read(child, &len, sizeof(uint32_t)) == -1) {
      perror("Reading uuid length");
      continue;
    }

    nsCString uuid;
    uuid.SetLength(len);

    if (read(child, uuid.BeginWriting(), len) == -1) {
      perror("Reading uuid");
      continue;
    }

    pid_t pid = getpid();
    if (write(child, &pid, sizeof(pid)) == -1) {
      perror("Sending pid");
      continue;
    }

    printf("*** Creating new parent.\n");
    mPWAs.AppendElement(new RemotePWA(uuid, child));
  }

  printf("*** Exiting listener.\n");
}

} // namespace pwa
} // namespace mozilla

void
NS_InitPWAManager() {
  if (mozilla::pwa::sManager) {
    return;
  }

  mozilla::pwa::sManager = new mozilla::pwa::RemotePWAManager();
}
