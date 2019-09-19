/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef PWAParent_h_
#define PWAParent_h_

#include "mozilla/pwa/PPWAParent.h"

namespace mozilla {
namespace pwa {

using mozilla::ipc::IPCResult;

class PWAParent : public PPWAParent{
  friend class PPWAParent;

 public:
  PWAParent() {}

 protected:
  ~PWAParent() {}

  virtual mozilla::ipc::IPCResult RecvChildConnected() = 0;
};

}  // namespace pwa
}  // namespace mozilla

#endif  // PWAParent_h_
