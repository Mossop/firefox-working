/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef nsWinPWASupport_h
#define nsWinPWASupport_h

#include "nsINativePWASupport.h"
#include "nsIRunnable.h"
#include "nsCOMArray.h"
#include "nsIFile.h"
#include "nsIRequestObserver.h"
#include "nsProxyRelease.h"

class PWAInstaller final : public nsIRunnable,
                           public nsIRequestObserver {
 public:
  NS_DECL_THREADSAFE_ISUPPORTS
  NS_DECL_NSIRUNNABLE
  NS_DECL_NSIREQUESTOBSERVER

  PWAInstaller(nsIPWA* pwa, nsIFile* dir, mozilla::dom::Promise* promise);

  nsresult Install();
 private:
  ~PWAInstaller() = default;

  nsresult Resolve();
  nsresult Reject(nsresult rv);

  nsresult CollectIcons();
  nsresult BuildIco();
  nsresult BuildShortcut();

  nsCOMPtr<nsIPWA> mPwa;
  nsCOMPtr<nsIFile> mDir;
  nsCOMArray<nsIFile> mIconFiles;
  nsTArray<nsCString> mIconTypes;
  nsMainThreadPtrHandle<mozilla::dom::Promise> mPromise;
};

class nsWinPWASupport final : public nsINativePWASupport {
 public:
  NS_DECL_ISUPPORTS
  NS_DECL_NSINATIVEPWASUPPORT

  static already_AddRefed<nsWinPWASupport> GetSingleton();

 private:
  nsWinPWASupport() = default;
  ~nsWinPWASupport() = default;

  static RefPtr<nsWinPWASupport> gSingleton;
};

#endif
