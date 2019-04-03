/* -*- Mode: C++; tab-width: 8; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set ts=8 sts=2 et sw=2 tw=80: */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "PWAView.h"
#import <QuartzCore/CALayer.h>
#include "nsCocoaUtils.h"

#define ENSURE(x) \
  do { \
    if (!(x)) { \
      fprintf(stderr, "Check %s failed at %s:%d\n", #x, __FILE__, __LINE__); \
      exit(1); \
    } \
  } while (0)

namespace mozilla {
namespace pwa {

PWAView::PWAView(NSView* windowView, mozilla::LayoutDeviceIntRect bounds, CAContextID layerContextId) {
  printf("*** Creating view %u %d %d %d %d.\n", layerContextId, bounds.x, bounds.y, bounds.width, bounds.height);
  CGFloat scaleFactor = nsCocoaUtils::GetBackingScaleFactor(windowView);
  NSRect r = nsCocoaUtils::DevPixelsToCocoaPoints(bounds, scaleFactor);
  mView = [[NSView alloc] initWithFrame:r];
  [mView setWantsLayer:YES];

  mRemoteLayer = [[CALayerHost alloc] init];
  ENSURE(mRemoteLayer);
  [mRemoteLayer setContextId:layerContextId];
  [mRemoteLayer setBounds:r];
  [mRemoteLayer setContentsGravity:kCAGravityTopLeft];
  [mRemoteLayer setContentsScale:scaleFactor];

  [[mView layer] addSublayer:mRemoteLayer];
  [mRemoteLayer setAnchorPoint:CGPointMake(0, 0)];

  printf("*** Made view %f %f %f %f.\n", mView.frame.origin.x, mView.frame.origin.y, mView.frame.size.width, mView.frame.size.height);
  printf("*** Made layer %u %f %f %f %f.\n", layerContextId, mRemoteLayer.frame.origin.x, mRemoteLayer.frame.origin.y, mRemoteLayer.frame.size.width, mRemoteLayer.frame.size.height);

  [windowView addSubview:mView];
}

}  // namespace pwa
}  // namespace mozilla
