/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

callback WindowKeyboardShortcutCallback = void ();

enum WindowKeyboardShortcutModifier {
  "shift", "alt", "meta", "control", "os", "accel", "access"
};

dictionary WindowKeyboardShortcutInfo {
  DOMString key;
  DOMString keyCode;
  boolean reserved;
  sequence<WindowKeyboardShortcutModifier> modifiers;
};

[NoInterfaceObject, Exposed=Window]
interface WindowKeyboardShortcut {
  attribute boolean disabled;

  void unregister();
};
