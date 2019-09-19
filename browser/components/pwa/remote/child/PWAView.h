/* -*- Mode: C++; tab-width: 8; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set ts=8 sts=2 et sw=2 tw=80: */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef PWAView_h_
#define PWAView_h_

#include "mozilla/pwa/PWAViewChild.h"
#include "CocoaPrivate.h"

namespace mozilla {
namespace pwa {
  class PWAView;
}
}

@interface PWANSView : NSView {
 @private
  mozilla::pwa::PWAView* mPWAView;
  NSDate* mLastUpdate;
}
@end

namespace mozilla {
namespace pwa {

class PWAView : public PWAViewChild {
 public:
  explicit PWAView(PWAWindow* aWindow, NSView* view, mozilla::LayoutDeviceIntRect bounds, uint32_t layerContextId);

  void UpdateState();

 private:
  ~PWAView() = default;

  RefPtr<PWAWindow> mWindow;
  CALayerHost* mRemoteLayer;
  PWANSView* mView;
  bool mVisible;

 protected:
  IPCResult RecvShow(bool state) override;
  IPCResult RecvDestroy() override;
};

} // namespace pwa
} // namespace mozilla

#endif
