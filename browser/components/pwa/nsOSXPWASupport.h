/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef nsOSXPWASupport_h
#define nsOSXPWASupport_h

#include "nsINativePWASupport.h"

class nsOSXPWASupport final : public nsINativePWASupport {
 public:
  NS_DECL_ISUPPORTS
  NS_DECL_NSINATIVEPWASUPPORT

  static already_AddRefed<nsOSXPWASupport> GetSingleton();

 private:
  nsOSXPWASupport() = default;
  ~nsOSXPWASupport() = default;

  static RefPtr<nsOSXPWASupport> gSingleton;
};

#endif
