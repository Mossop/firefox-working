/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef PWAWindowParent_h_
#define PWAWindowParent_h_

#include "mozilla/pwa/PPWAWindowParent.h"
#include "PWAParent.h"

namespace mozilla {
namespace pwa {

class PWAWindowParent : public PPWAWindowParent {
  friend class PPWAWindowParent;

 protected:
  virtual PPWAChildViewParent* AllocPPWAChildViewParent(mozilla::LayoutDeviceIntRect bounds, uint32_t layerContextId) = 0;
  virtual bool DeallocPPWAChildViewParent(PPWAChildViewParent* aActor) = 0;
};

}  // namespace pwa
}  // namespace mozilla

#endif  // PWAWindowParent_h_
