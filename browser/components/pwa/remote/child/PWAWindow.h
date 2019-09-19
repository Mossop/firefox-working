/* -*- Mode: C++; tab-width: 8; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set ts=8 sts=2 et sw=2 tw=80: */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef PWAWindow_h_
#define PWAWindow_h_

#include "mozilla/pwa/PWAWindowChild.h"
#import <Cocoa/Cocoa.h>

namespace mozilla {
namespace pwa {
  class PWAWindow;
}
}

@interface Delegate : NSObject <NSWindowDelegate> {
 @private
  mozilla::pwa::PWAWindow* mWindow;
}
@end

@interface PWANSWindow : NSWindow {
 @private
  mozilla::pwa::PWAWindow* mWindow;
}
@end

namespace mozilla {
namespace pwa {

class PWAWindow : public PWAWindowChild {
 public:
  explicit PWAWindow(DesktopIntRect aOuterBounds, LayoutDeviceIntRect aInnerBounds, nsBorderStyle aBorderStyle);
  NS_INLINE_DECL_THREADSAFE_REFCOUNTING(PWAWindow, final)

  void UpdateState();

 protected:
  virtual PPWAViewChild* AllocPPWAViewChild(mozilla::LayoutDeviceIntRect bounds, uint32_t layerContextId) override;
  virtual void DeallocPPWAViewChild(PPWAViewChild* aChild) override;

  IPCResult RecvSetTitle(nsString title) override;
  IPCResult RecvShow(bool state) override;
  IPCResult RecvDestroy() override;

 private:
  ~PWAWindow() = default;

  PWANSWindow* mWindow;
  Delegate* mDelegate;
};

} // namespace pwa
} // namespace mozilla

#endif
