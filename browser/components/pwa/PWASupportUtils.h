/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef PWASupportUtils_h
#define PWASupportUtils_h

#include "mozIDOMWindow.h"
#include "nsINativePWASupport.h"

#define NS_PROMISE_SUCCESS(res, promise)                           \
  do {                                                             \
    nsresult __rv = res; /* Don't evaluate |res| more than once */ \
    if (NS_WARN_IF(NS_FAILED(__rv))) {                             \
      (promise)->MaybeReject(__rv);                                 \
      return NS_OK;                                                \
    }                                                              \
  } while (false)

nsresult MakePromise(JSContext* cx, mozilla::dom::Promise** result);
nsresult OpenWindow(nsIPWA* pwa, nsIPWALoadInfo* loadInfo, mozIDOMWindowProxy** window);
nsresult FindWindow(nsIPWA* pwa, mozIDOMWindowProxy** window);
nsresult LoadPwa(nsIPWA* pwa, nsIPWALoadInfo* loadInfo);

#endif
