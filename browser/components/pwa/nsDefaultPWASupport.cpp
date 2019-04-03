/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "nsDefaultPWASupport.h"
#include "mozilla/dom/Promise.h"
#include "PWASupportUtils.h"

using mozilla::ErrorResult;
using mozilla::dom::Promise;

NS_IMPL_ISUPPORTS(nsDefaultPWASupport, nsINativePWASupport)

RefPtr<nsDefaultPWASupport> nsDefaultPWASupport::gSingleton = nullptr;

already_AddRefed<nsDefaultPWASupport> nsDefaultPWASupport::GetSingleton() {
  if (!nsDefaultPWASupport::gSingleton) {
    nsDefaultPWASupport::gSingleton = new nsDefaultPWASupport();
  }

  return do_AddRef(nsDefaultPWASupport::gSingleton);
}

NS_IMETHODIMP
nsDefaultPWASupport::Install(nsIPWA* pwa, nsIFile* dir, JSContext* cx, Promise** result) {
  RefPtr<Promise> promise;
  nsresult rv = MakePromise(cx, getter_AddRefs(promise));
  NS_ENSURE_SUCCESS(rv, rv);

  promise->MaybeResolveWithUndefined();
  promise.forget(result);

  return NS_OK;
}

NS_IMETHODIMP
nsDefaultPWASupport::Load(nsIPWA* pwa, nsIFile* dir, nsIPWALoadInfo* loadInfo, JSContext* cx, Promise** result) {
  RefPtr<Promise> promise;
  nsresult rv = MakePromise(cx, getter_AddRefs(promise));
  NS_ENSURE_SUCCESS(rv, rv);
  NS_ADDREF(*result = promise);

  rv = LoadPwa(pwa, loadInfo);
  NS_PROMISE_SUCCESS(rv, promise);

  promise->MaybeResolveWithUndefined();
  return NS_OK;
}
