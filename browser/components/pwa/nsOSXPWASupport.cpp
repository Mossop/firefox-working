/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "nsOSXPWASupport.h"
#include "mozilla/dom/Promise.h"
#include "PWASupportUtils.h"

using mozilla::ErrorResult;
using mozilla::dom::Promise;

NS_IMPL_ISUPPORTS(nsOSXPWASupport, nsINativePWASupport)

RefPtr<nsOSXPWASupport> nsOSXPWASupport::gSingleton = nullptr;

already_AddRefed<nsOSXPWASupport> nsOSXPWASupport::GetSingleton() {
  if (!nsOSXPWASupport::gSingleton) {
    nsOSXPWASupport::gSingleton = new nsOSXPWASupport();
  }

  return do_AddRef(nsOSXPWASupport::gSingleton);
}

NS_IMETHODIMP
nsOSXPWASupport::Install(nsIPWA* pwa, nsIFile* dir, JSContext* cx, Promise** result) {
  RefPtr<Promise> promise;
  nsresult rv = MakePromise(cx, getter_AddRefs(promise));
  NS_ENSURE_SUCCESS(rv, rv);

  promise->MaybeResolveWithUndefined();
  promise.forget(result);

  return NS_OK;
}

NS_IMETHODIMP
nsOSXPWASupport::Load(nsIPWA* pwa, nsIFile* dir, nsIPWALoadInfo* loadInfo, JSContext* cx, Promise** result) {
  RefPtr<Promise> promise;
  nsresult rv = MakePromise(cx, getter_AddRefs(promise));
  NS_ENSURE_SUCCESS(rv, rv);

  promise->MaybeResolveWithUndefined();
  promise.forget(result);

  return NS_OK;
}
