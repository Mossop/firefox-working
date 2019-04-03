/* -*- Mode: C++; tab-width: 8; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set ts=8 sts=2 et sw=2 tw=80: */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef RemoteWindow_h_
#define RemoteWindow_h_

#include "mozilla/pwa/PWAWindowParent.h"
#include "RemoteView.h"

#import <Cocoa/Cocoa.h>
#import <QuartzCore/CALayer.h>

namespace mozilla {
namespace pwa{

class RemotePWA;
using mozilla::ipc::IPCResult;

class RemoteWindow : public PWAWindowParent {
 public:
  NS_INLINE_DECL_THREADSAFE_REFCOUNTING(RemoteWindow)

  explicit RemoteWindow();

  RemoteView* CreateChildView(mozilla::LayoutDeviceIntRect bounds, CALayer* layer);

 protected:
  PPWAChildViewParent* AllocPPWAChildViewParent(mozilla::LayoutDeviceIntRect bounds, uint32_t layerContextId) override;
  bool DeallocPPWAChildViewParent(PPWAChildViewParent* aActor) override;

 private:
  ~RemoteWindow();

  RemotePWA* remotePWA();
  nsTArray<RefPtr<RemoteView>> mViews;
};

} // namespace pwa
} // namespace mozilla

#endif
