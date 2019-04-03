/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef nsDefaultPWASupport_h
#define nsDefaultPWASupport_h

#include "mozilla/RefPtr.h"
#include "nsINativePWASupport.h"
#include "mozIDOMWindow.h"

class nsDefaultPWASupport final : public nsINativePWASupport {
 public:
  NS_DECL_ISUPPORTS
  NS_DECL_NSINATIVEPWASUPPORT

  static already_AddRefed<nsDefaultPWASupport> GetSingleton();

 protected:
  nsDefaultPWASupport() = default;
  ~nsDefaultPWASupport() = default;

  static RefPtr<nsDefaultPWASupport> gSingleton;
};

#endif
