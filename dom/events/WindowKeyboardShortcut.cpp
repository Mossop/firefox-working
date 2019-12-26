/* -*- Mode: C++; tab-width: 8; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set ts=8 sts=2 et sw=2 tw=80: */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "WindowKeyboardShortcut.h"
#include "mozilla/dom/WindowKeyboardShortcutBinding.h"

namespace mozilla {

NS_IMPL_CYCLE_COLLECTION_WRAPPERCACHE_0(WindowKeyboardShortcut)

NS_IMPL_CYCLE_COLLECTION_ROOT_NATIVE(WindowKeyboardShortcut, AddRef)
NS_IMPL_CYCLE_COLLECTION_UNROOT_NATIVE(WindowKeyboardShortcut, Release)

WindowKeyboardShortcut::WindowKeyboardShortcut(nsPIDOMWindowInner* aWindow,
    JSGlobalKeyListener* aListener, JSKeyEventHandler* aEventHandler)
  : mWindow(aWindow),
    mListener(aListener),
    mEventHandler(aEventHandler) {
}

nsISupports*
WindowKeyboardShortcut::GetParentObject() const {
  return mWindow.get();
}

JSObject*
WindowKeyboardShortcut::WrapObject(JSContext* aCx, JS::Handle<JSObject*> aGivenProto) {
  return WindowKeyboardShortcut_Binding::Wrap(aCx, this, aGivenProto);
}

bool
WindowKeyboardShortcut::Disabled() {
  return mEventHandler ? mEventHandler->Disabled() : true;
}

void
WindowKeyboardShortcut::SetDisabled(bool aDisabled) {
  if (mEventHandler) {
    mEventHandler->SetDisabled(aDisabled);
  }
}

void
WindowKeyboardShortcut::Unregister() {
  if (mListener && mEventHandler) {
    mListener->Unregister(mEventHandler);
  }

  mListener = nullptr;
  mEventHandler = nullptr;
}

} // namespace mozilla
