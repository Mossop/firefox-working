/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "PWASupportUtils.h"
#include "nsIMutableArray.h"
#include "nsIWindowWatcher.h"
#include "nsIGlobalObject.h"
#include "xpcpublic.h"
#include "mozilla/dom/Promise.h"
#include "nsIWindowMediator.h"
#include "nsIBrowserDOMWindow.h"
#include "nsIDOMChromeWindow.h"

using mozilla::dom::Promise;

nsresult MakePromise(JSContext* cx, Promise** result) {
  nsIGlobalObject* globalObject = xpc::CurrentNativeGlobal(cx);
  if (NS_WARN_IF(!globalObject)) {
    return NS_ERROR_FAILURE;
  }

  mozilla::ErrorResult er;
  RefPtr<Promise> promise = Promise::Create(globalObject, er);
  if (NS_WARN_IF(er.Failed())) {
    return er.StealNSResult();
  }

  promise.forget(result);

  return NS_OK;
}

nsresult OpenWindow(nsIPWA* pwa, nsIPWALoadInfo* loadInfo, mozIDOMWindowProxy** window) {
  nsresult rv;
  nsCOMPtr<nsIMutableArray> args = do_CreateInstance(NS_ARRAY_CONTRACTID, &rv);
  NS_ENSURE_SUCCESS(rv, rv);

  rv = args->AppendElement(pwa);
  NS_ENSURE_SUCCESS(rv, rv);

  rv = args->AppendElement(loadInfo);
  NS_ENSURE_SUCCESS(rv, rv);

  nsCOMPtr<nsIWindowWatcher> wwatch =
      do_GetService(NS_WINDOWWATCHER_CONTRACTID, &rv);
  NS_ENSURE_SUCCESS(rv, rv);

  rv = wwatch->OpenWindow(nullptr, "chrome://browser/content/pwa/pwa.xul", "_blank",
                          "chrome,width=1024,height=500,centerscreen,resizable,dialog=no",
                          args, window);
  return rv;
}

nsresult FindWindow(nsIPWA* pwa, mozIDOMWindowProxy** window) {
  nsresult rv;
  nsCOMPtr<nsIWindowMediator> mediator =
      do_GetService(NS_WINDOWMEDIATOR_CONTRACTID, &rv);
  NS_ENSURE_SUCCESS(rv, rv);

  nsCString type;
  rv = pwa->GetId(type);
  NS_ENSURE_SUCCESS(rv, rv);
  type.Insert("pwa:", 0);

  nsString wtype = NS_ConvertUTF8toUTF16(type);
  rv = mediator->GetMostRecentWindow(wtype.get(), window);
  return rv;
}

nsresult LoadPwa(nsIPWA* pwa, nsIPWALoadInfo* loadInfo) {
  nsCOMPtr<mozIDOMWindowProxy> windowProxy;
  nsresult rv = FindWindow(pwa, getter_AddRefs(windowProxy));

  if (NS_SUCCEEDED(rv) && windowProxy) {
    nsCOMPtr<nsPIDOMWindowOuter> window = nsPIDOMWindowOuter::From(windowProxy);

    if (loadInfo) {
      nsCOMPtr<nsIDOMChromeWindow> chromeWin = do_QueryInterface(windowProxy);
      if (!chromeWin) {
        return NS_ERROR_UNEXPECTED;
      }

      nsCOMPtr<nsIBrowserDOMWindow> bdw;
      rv = chromeWin->GetBrowserDOMWindow(getter_AddRefs(bdw));
      NS_ENSURE_SUCCESS(rv, rv);

      nsCOMPtr<nsIPWAWindow> pwaWin(do_QueryInterface(bdw));
      if (!pwaWin) {
        return NS_ERROR_UNEXPECTED;
      }

      rv = pwaWin->Load(loadInfo);
      NS_ENSURE_SUCCESS(rv, rv);
    }

    window->Focus();
    return NS_OK;
  }

  return OpenWindow(pwa, loadInfo, getter_AddRefs(windowProxy));
}
