/* -*- Mode: C++; tab-width: 8; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set ts=8 sts=2 et sw=2 tw=80: */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef RemoteView_h_
#define RemoteView_h_

#include "mozilla/pwa/PWAChildViewParent.h"
#import <QuartzCore/CALayer.h>

#ifdef __OBJC__
@class CAContext;
@class CALayer;
#else
typedef void CAContext;
typedef void CALayer;
#endif

namespace mozilla {
namespace pwa{

using mozilla::ipc::IPCResult;

class RemoteView : public PPWAChildViewParent {
 public:
  NS_INLINE_DECL_THREADSAFE_REFCOUNTING(RemoteView)

  explicit RemoteView(CALayer* layer);

  uint32_t GetLayerContextId();

 private:
  ~RemoteView();

  CAContext* mCAContext;
  CALayer* mLayer;
};

} // namespace pwa
} // namespace mozilla

#endif
