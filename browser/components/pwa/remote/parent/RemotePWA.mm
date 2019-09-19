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
#include "nsAppShellCID.h"
#include "nsIAppShellService.h"
#include "nsIWidget.h"
#include "nsIWindowlessBrowser.h"
#include "nsIDocShellTreeItem.h"
#include "nsGlobalWindowOuter.h"
#include "nsDocShellLoadState.h"
#include "nsIWebNavigation.h"
#include "nsWebShellWindow.h"
#include "mozilla/intl/LocaleService.h"

namespace mozilla {
namespace pwa {

RemotePWA::RemotePWA(nsACString& uuid, int child)
    : mUuid(uuid),
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

mozilla::ipc::IPCResult
RemotePWA::RecvChildConnected() {
  // Open PWA window
  printf("*** Launching PWA %p.\n", this);

  RefPtr<nsWebShellWindow> window = new nsWebShellWindow(nsIWebBrowserChrome::CHROME_ALL);
  nsWidgetInitData widgetInitData;
  widgetInitData.mWindowType = eWindowType_toplevel;
  widgetInitData.mBorderStyle = eBorderStyle_all;
  widgetInitData.mRTL = intl::LocaleService::GetInstance()->IsAppLocaleRTL();

  nsCOMPtr<nsIWidget> widget = new RemoteWindow(this);
  nsresult rv = window->InitializeWithWidget(
      nullptr, nullptr, nullptr, 1024, 500,
      false, nullptr, nullptr, widgetInitData, widget);

  nsCOMPtr<nsIAppShellService> appShellService(
      do_GetService(NS_APPSHELLSERVICE_CONTRACTID));
  appShellService->RegisterTopLevelWindow(window);

  nsCOMPtr<nsIDocShell> docShell;
  window->GetXULWindow()->GetDocShell(getter_AddRefs(docShell));
  if (!docShell) {
    printf("*** Failed to get docshell tree item.\n");
    return IPCResult::Ok();
  }

  RefPtr<dom::BrowsingContext> newBC = docShell->GetBrowsingContext();
  RefPtr<nsGlobalWindowOuter> win(nsGlobalWindowOuter::Cast(newBC->GetDOMWindow()));
  if (!win) {
    printf("*** Failed to get window.\n");
    return IPCResult::Ok();
  }

  nsCOMPtr<nsIMutableArray> args = do_CreateInstance(NS_ARRAY_CONTRACTID);
  nsCOMPtr<nsISupportsString> homepage =
      do_CreateInstance(NS_SUPPORTS_STRING_CONTRACTID);
  homepage->SetData(NS_LITERAL_STRING("about:home"));
  args->AppendElement(homepage);

  rv = win->SetArguments(args);
  if (NS_FAILED(rv)) {
    printf("*** Failed to set window arguments.\n");
    return IPCResult::Ok();
  }

  nsCOMPtr<nsIURI> uri;
  NS_NewURI(getter_AddRefs(uri), NS_LITERAL_CSTRING("chrome://browser/content/browser.xhtml"));
  RefPtr<nsDocShellLoadState> loadState = new nsDocShellLoadState(uri);
  loadState->SetLoadFlags(static_cast<uint32_t>(nsIWebNavigation::LOAD_FLAGS_FIRST_LOAD));
  loadState->SetFirstParty(true);
  loadState->SetTriggeringPrincipal(nsContentUtils::GetSystemPrincipal());

  newBC->LoadURI(nullptr, loadState);

  return IPC_OK();
}

}  // namespace pwa
}  // namespace mozilla
