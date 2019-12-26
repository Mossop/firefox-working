/* -*- Mode: C++; tab-width: 8; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set ts=8 sts=2 et sw=2 tw=80: */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef mozilla_WindowKeyboardShortcut_h_
#define mozilla_WindowKeyboardShortcut_h_

#include "nsWrapperCache.h"
#include "nsPIDOMWindow.h"
#include "mozilla/GlobalKeyListener.h"
#include "mozilla/KeyEventHandler.h"

namespace mozilla {

class WindowKeyboardShortcut final : public nsWrapperCache {
 public:
  NS_INLINE_DECL_CYCLE_COLLECTING_NATIVE_REFCOUNTING(WindowKeyboardShortcut)
  NS_DECL_CYCLE_COLLECTION_SCRIPT_HOLDER_NATIVE_CLASS(WindowKeyboardShortcut)

  WindowKeyboardShortcut(nsPIDOMWindowInner* aWindow,
      JSGlobalKeyListener* aListener, JSKeyEventHandler* aEventHandler);
  nsISupports* GetParentObject() const;
  virtual JSObject* WrapObject(JSContext* aCx, JS::Handle<JSObject*> aGivenProto) override;

  bool Disabled();
  void SetDisabled(bool aDisabled);

  void Unregister();

 private:
  ~WindowKeyboardShortcut() = default;

  nsCOMPtr<nsPIDOMWindowInner> mWindow;
  RefPtr<JSGlobalKeyListener> mListener;

  // This object is owned by the global listener.
  JSKeyEventHandler* mEventHandler;
};

}  // namespace mozilla

#endif
