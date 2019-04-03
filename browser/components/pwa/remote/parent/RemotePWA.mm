/* -*- Mode: C++; tab-width: 8; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set ts=8 sts=2 et sw=2 tw=80: */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "RemotePWA.h"
#include "mozilla/ipc/BrowserProcessSubThread.h"
#include "nsIWindowWatcher.h"
#include "nsIMutableArray.h"
#include "nsISupportsPrimitives.h"

namespace mozilla {
namespace pwa {

RemotePWA::RemotePWA(nsACString& uuid, uint32_t remoteId, int child)
    : mUuid(uuid),
      mRemoteId(remoteId),
      mHost(child) {
  // The channel must be set up on the IO thread...
  RefPtr<Runnable> initChannel = mozilla::NewRunnableMethod("RemotePWA::Init", this, &RemotePWA::Init);
  XRE_GetIOMessageLoop()->SerialEventTarget()->Dispatch(initChannel.forget(), NS_DISPATCH_NORMAL);
}

RemotePWA::~RemotePWA() {
}

void
RemotePWA::Shutdown() {
}

void
RemotePWA::Init() {
  ipc::AssertIOThread();

  mHost.InitializeChannel();

  // The channel must be opened off the IO thread though...
  RefPtr<Runnable> connect = mozilla::NewRunnableMethod("RemotePWA::Connect", this, &RemotePWA::Connect);
  NS_DispatchToMainThread(connect.forget(), NS_DISPATCH_NORMAL);
}

void
RemotePWA::Connect() {
  if (!Open(mHost.GetChannel(), base::GetProcId(mHost.GetChildProcessHandle()))) {
    printf("*** Failed to open channel.\n");
  } else {
    printf("*** Channel open.\n");
  }
}

already_AddRefed<RemoteWindow>
RemotePWA::CreateRemoteWindow() {
  RefPtr<RemoteWindow> parent = static_cast<RemoteWindow*>(SendPPWAWindowConstructor());
  return parent.forget();
}

PPWAWindowParent* RemotePWA::AllocPPWAWindowParent() {
  RemoteWindow* window = new RemoteWindow();
  mWindows.AppendElement(window);
  return window;
}

bool RemotePWA::DeallocPPWAWindowParent(PPWAWindowParent* aActor) {
  RemoteWindow* window = static_cast<RemoteWindow*>(aActor);
  mWindows.RemoveElement(window);
  return true;
}

mozilla::ipc::IPCResult
RemotePWA::RecvChildConnected() {
  // Open PWA window
  printf("*** Launching PWA %p.\n", this);

  nsCOMPtr<nsIMutableArray> args = do_CreateInstance(NS_ARRAY_CONTRACTID);
  nsCOMPtr<nsISupportsString> homepage =
      do_CreateInstance(NS_SUPPORTS_STRING_CONTRACTID);
  homepage->SetData(NS_LITERAL_STRING("about:home"));
  args->AppendElement(homepage);

  nsCOMPtr<mozIDOMWindowProxy> window;
  nsPrintfCString features("chrome,width=1024,height=500,all,centerscreen,resizable,dialog=no,remoteid=%d", mRemoteId);
  nsCOMPtr<nsIWindowWatcher> wwatch(do_GetService(NS_WINDOWWATCHER_CONTRACTID));
  wwatch->OpenWindow(nullptr, "chrome://browser/content/browser.xhtml", "_blank",
                     features.get(), args, getter_AddRefs(window));

  return IPC_OK();
}

}  // namespace pwa
}  // namespace mozilla
