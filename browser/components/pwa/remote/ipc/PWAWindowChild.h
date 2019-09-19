/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef PWAWindowChild_h_
#define PWAWindowChild_h_

#include "mozilla/pwa/PPWAWindowChild.h"

namespace mozilla {
namespace pwa {

using mozilla::ipc::IPCResult;

class PWAWindowChild : public PPWAWindowChild {
  friend class PPWAWindowChild;

 protected:
  virtual PPWAViewChild* AllocPPWAViewChild(mozilla::LayoutDeviceIntRect bounds, uint32_t layerContextId) = 0;
  virtual void DeallocPPWAViewChild(PPWAViewChild* aChild) = 0;

  virtual IPCResult RecvSetTitle(nsString title) = 0;
  virtual IPCResult RecvShow(bool state) = 0;
  virtual IPCResult RecvDestroy() = 0;
};

}  // namespace pwa
}  // namespace mozilla

#endif  // PWAWindowChild_h_
