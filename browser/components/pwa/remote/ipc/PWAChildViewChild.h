/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef PWAChildViewChild_h_
#define PWAChildViewChild_h_

#include "mozilla/pwa/PPWAChildViewChild.h"

namespace mozilla {
namespace pwa {

using mozilla::ipc::IPCResult;

class PWAChildViewChild : public PPWAChildViewChild {
  friend class PPWAChildViewChild;
};

}  // namespace pwa
}  // namespace mozilla

#endif  // PWAChildViewChild_h_
