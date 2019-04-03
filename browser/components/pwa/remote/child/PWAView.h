/* -*- Mode: C++; tab-width: 8; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set ts=8 sts=2 et sw=2 tw=80: */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef PWAView_h_
#define PWAView_h_

#include "mozilla/pwa/PWAChildViewChild.h"
#include "CocoaPrivate.h"

namespace mozilla {
namespace pwa {

class PWAView : public PWAChildViewChild {
 public:
  explicit PWAView(NSView* parentView, mozilla::LayoutDeviceIntRect bounds, uint32_t layerContextId);

 private:
  NSView* mView;
  CALayerHost* mRemoteLayer;
};

} // namespace pwa
} // namespace mozilla

#endif
