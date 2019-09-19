/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef PWAChild_h_
#define PWAChild_h_

#include "mozilla/pwa/PPWAChild.h"

namespace mozilla {
namespace pwa {

using mozilla::ipc::IPCResult;

class PWAChild : public PPWAChild {
  friend class PPWAChild;

 protected:
  virtual PPWAWindowChild* AllocPPWAWindowChild(DesktopIntRect outerBounds, LayoutDeviceIntRect innerBounds, nsBorderStyle borderStyle) = 0;
};

}  // namespace gmp
}  // namespace mozilla

#endif  // PWAChild_h_