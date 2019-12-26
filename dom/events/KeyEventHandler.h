/* -*- Mode: C++; tab-width: 8; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set ts=8 sts=2 et sw=2 tw=80: */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef mozilla_KeyEventHandler_h_
#define mozilla_KeyEventHandler_h_

#include "mozilla/EventForwards.h"
#include "mozilla/MemoryReporting.h"
#include "nsAtom.h"
#include "nsString.h"
#include "nsCOMPtr.h"
#include "nsIController.h"
#include "nsAutoPtr.h"
#include "nsIWeakReference.h"
#include "nsCycleCollectionParticipant.h"
#include "js/TypeDecls.h"
#include "mozilla/ShortcutKeys.h"

namespace mozilla {

namespace layers {
class KeyboardShortcut;
}  // namespace layers

struct IgnoreModifierState;

namespace dom {
class Event;
class UIEvent;
class Element;
class EventTarget;
class KeyboardEvent;
class Element;
}  // namespace dom

using namespace dom;

// Values of the reserved attribute. When unset, the default value depends on
// the permissions.default.shortcuts preference.
enum ReservedKey : uint8_t {
  ReservedKey_False = 0,
  ReservedKey_True = 1,
  ReservedKey_Unset = 2,
};

class KeyEventHandler {
 public:
  virtual ~KeyEventHandler();

  bool EventTypeEquals(nsAtom* aEventType) const {
    return mEventName == aEventType;
  }

  // if aCharCode is not zero, it is used instead of the charCode of
  // aKeyEventHandler.
  bool KeyEventMatched(KeyboardEvent* aDomKeyboardEvent, uint32_t aCharCode,
                       const IgnoreModifierState& aIgnoreModifierState);

  KeyEventHandler* GetNextHandler() { return mNextHandler; }
  void SetNextHandler(KeyEventHandler* aHandler) { mNextHandler = aHandler; }

  MOZ_CAN_RUN_SCRIPT
  virtual nsresult ExecuteHandler(EventTarget* aTarget, Event* aEvent) = 0;

  virtual size_t SizeOfIncludingThis(mozilla::MallocSizeOf aMallocSizeOf) const;

 public:
  static uint32_t gRefCnt;

 protected:
  KeyEventHandler()
   : mNextHandler(nullptr) {
    ++gRefCnt;
    if (gRefCnt == 1) {
      // Get the primary accelerator key.
      InitAccessKeys();
    }
  }

  inline int32_t GetMatchingKeyCode(const nsAString& aKeyName);
  void BuildModifiers(nsAString& aModifiers);

  bool ModifiersMatchMask(UIEvent* aEvent,
                          const IgnoreModifierState& aIgnoreModifierState);

  Modifiers GetModifiers() const;
  Modifiers GetModifiersMask() const;

  static int32_t KeyToMask(int32_t key);
  static int32_t AccelKeyMask();

  static int32_t kMenuAccessKey;
  static void InitAccessKeys();

  static const int32_t cShift;
  static const int32_t cAlt;
  static const int32_t cControl;
  static const int32_t cMeta;
  static const int32_t cOS;

  static const int32_t cShiftMask;
  static const int32_t cAltMask;
  static const int32_t cControlMask;
  static const int32_t cMetaMask;
  static const int32_t cOSMask;

  static const int32_t cAllModifiers;

 protected:
  uint8_t mMisc;   // Miscellaneous extra information.  For key events,
                   // stores whether or not we're a key code or char code.
                   // For mouse events, stores the clickCount.

  int32_t mKeyMask;  // Which modifier keys this event handler expects to have
                     // down in order to be matched.

  // The primary filter information for mouse/key events.
  int32_t mDetail;  // For key events, contains a charcode or keycode. For
                    // mouse events, stores the button info.

  // Prototype handlers are chained. We own the next handler in the chain.
  KeyEventHandler* mNextHandler;
  RefPtr<nsAtom> mEventName;  // The type of the event, e.g., "keypress"
};

class JSKeyEventHandler final : public KeyEventHandler {
 public:
  explicit JSKeyEventHandler(
    const mozilla::dom::WindowKeyboardShortcutInfo& aInfo,
    mozilla::dom::WindowKeyboardShortcutCallback& aCallback);

  bool Disabled();
  void SetDisabled(bool aDisabled);

  MOZ_CAN_RUN_SCRIPT
  virtual nsresult ExecuteHandler(EventTarget* aTarget, Event* aEvent) override;

  ReservedKey GetIsReserved() { return mReserved; }

 protected:
  bool mDisabled;
  RefPtr<mozilla::dom::WindowKeyboardShortcutCallback> mCallback;
  ReservedKey mReserved;
};

class XULKeyEventHandler final : public KeyEventHandler {
 public:
  explicit XULKeyEventHandler(Element* aKeyElement);
  virtual ~XULKeyEventHandler() override;

  already_AddRefed<Element> GetHandlerElement();
  void GetEventType(nsAString& aEvent);
  MOZ_CAN_RUN_SCRIPT
  virtual nsresult ExecuteHandler(EventTarget* aTarget, Event* aEvent) override;

  void ReportKeyConflict(const char16_t* aKey, const char16_t* aModifiers,
                         Element* aKeyElement, const char* aMessageName);

  ReservedKey GetIsReserved() { return mReserved; }

 protected:
  nsIWeakReference* mHandlerElement;
  ReservedKey mReserved;
};

class ShortcutKeyEventHandler final : public KeyEventHandler {
 public:
  explicit ShortcutKeyEventHandler(ShortcutKeyData* aKeyData);
  virtual ~ShortcutKeyEventHandler() override;

  already_AddRefed<nsIController> GetController(EventTarget* aTarget);
  MOZ_CAN_RUN_SCRIPT
  virtual nsresult ExecuteHandler(EventTarget* aTarget, Event* aEvent) override;

  /**
   * Try and convert this Shortcut handler into an APZ KeyboardShortcut for
   * handling key events on the compositor thread. This only works for handlers
   * that represent scroll commands.
   *
   * @param aOut the converted KeyboardShortcut, must be non null
   * @return whether the handler was converted into a KeyboardShortcut
   */
  bool TryConvertToKeyboardShortcut(layers::KeyboardShortcut* aOut) const;

  virtual size_t SizeOfIncludingThis(mozilla::MallocSizeOf aMallocSizeOf) const override;

 protected:
  char16_t* mCommand;
};

}  // namespace mozilla

#endif
