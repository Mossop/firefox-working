/* -*- Mode: C++; tab-width: 8; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set ts=8 sts=2 et sw=2 tw=80: */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "PWAView.h"
#import <QuartzCore/CALayer.h>
#include "nsCocoaUtils.h"

@implementation PWANSView
- (id)initWithFrame:(NSRect)aRect pwaView:(mozilla::pwa::PWAView*)inView {
  self = [super initWithFrame:aRect];
  self.wantsLayer = YES;
  self.layerContentsRedrawPolicy = NSViewLayerContentsRedrawDuringViewResize;
  self.layer.contentsGravity = kCAGravityTopLeft;
  [self setAutoresizingMask:NSViewWidthSizable | NSViewHeightSizable];
  mPWAView = inView;
  mLastUpdate = nil;

  return self;
}

- (void)viewWillStartLiveResize {
  mPWAView->SendLiveResizeStarted();
}

- (void)viewDidEndLiveResize {
  mPWAView->SendLiveResizeEnded();
  mPWAView->UpdateState();
}

- (void)frameDidChange:(NSNotification*)notification {
  [self setFrame:NSMakeRect(0, 0, self.superview.frame.size.width, self.superview.frame.size.height)];

  if (mLastUpdate) {
    double interval = [mLastUpdate timeIntervalSinceNow];
    if (interval > -0.2) {
      return;
    }
  }

  mPWAView->UpdateState();
  mLastUpdate = [NSDate date];
}

- (BOOL)isFlipped {
  return YES;
}

- (NSView*)hitTest:(NSPoint)aPoint {
  return nil;
}

- (void)drawRect:(NSRect)aRect {
  [super drawRect:aRect];
}

- (BOOL)wantsUpdateLayer {
  return YES;
}

- (void)updateLayer {
  //mPWAView->SendUpdateLayer();
  [super updateLayer];
}

- (BOOL)wantsBestResolutionOpenGLSurface {
  return YES;
}
@end

namespace mozilla {
namespace pwa {

PWAView::PWAView(PWAWindow* aWindow, NSView* windowView, mozilla::LayoutDeviceIntRect bounds, CAContextID layerContextId)
  : mWindow(aWindow) {
  printf("*** Creating view %u %d %d %d %d.\n", layerContextId, bounds.x, bounds.y, bounds.width, bounds.height);
  CGFloat scaleFactor = nsCocoaUtils::GetBackingScaleFactor(windowView);
  printf("*** scaleFactor: %f\n", scaleFactor);
  NSRect rect = nsCocoaUtils::DevPixelsToCocoaPoints(bounds, scaleFactor);
  printf("*** Cocoa rect %f %f %f %f.\n", rect.origin.x, rect.origin.y, rect.size.width, rect.size.height);
  mView = [[PWANSView alloc] initWithFrame:rect pwaView:this];
  [mView setWantsLayer:YES];
  [mView setHidden:YES];
  mVisible = false;

  mRemoteLayer = [[CALayerHost alloc] init];
  [mRemoteLayer setContextId:layerContextId];
  [mRemoteLayer setBounds:rect];
  [mRemoteLayer setAnchorPoint:CGPointMake(0, 0)];
  [mRemoteLayer setPosition:CGPointMake(0, 0)];
  [[mView layer] addSublayer:mRemoteLayer];
  [[mView layer] setBounds:rect];
  [[mView layer] setPosition:CGPointMake(0, 0)];

  printf("*** Made view frame %f %f %f %f.\n", mView.frame.origin.x, mView.frame.origin.y, mView.frame.size.width, mView.frame.size.height);
  printf("*** Made view bounds %f %f %f %f.\n", mView.bounds.origin.x, mView.bounds.origin.y, mView.bounds.size.width, mView.bounds.size.height);
  printf("*** Made layer frame %f %f %f %f.\n", mRemoteLayer.frame.origin.x, mRemoteLayer.frame.origin.y, mRemoteLayer.frame.size.width, mRemoteLayer.frame.size.height);
  printf("*** Made layer bounds %f %f %f %f.\n", mRemoteLayer.bounds.origin.x, mRemoteLayer.bounds.origin.y, mRemoteLayer.bounds.size.width, mRemoteLayer.bounds.size.height);

  [windowView addSubview:mView];

  [windowView setPostsFrameChangedNotifications:YES];
  [[NSNotificationCenter defaultCenter] addObserver:mView
      selector:@selector(frameDidChange:)
      name:NSViewFrameDidChangeNotification
      object:windowView];
}

void
PWAView::UpdateState() {
  NSRect bounds = [mView frame];
  bounds.origin.x = 0;
  bounds.origin.y = 0;
  [mView setBounds:bounds];
  [mView setFrameOrigin:CGPointMake(0, 0)];
  [[mView layer] setBounds:bounds];
  [[mView layer] setPosition:CGPointMake(0, 0)];
  [mRemoteLayer setBounds:bounds];
  [mRemoteLayer setAnchorPoint:CGPointMake(0, 0)];
  [mRemoteLayer setPosition:CGPointMake(0, 0)];
  CGFloat scale = nsCocoaUtils::GetBackingScaleFactor(mView);
  LayoutDeviceIntRect gBounds = nsCocoaUtils::CocoaRectToGeckoRectDevPix(bounds, scale);
  // The origin is relative to the frame not the screen.
  gBounds.y = 0;

  SendUpdateState(gBounds, mVisible);

  printf("*** Made view frame %f %f %f %f.\n", mView.frame.origin.x, mView.frame.origin.y, mView.frame.size.width, mView.frame.size.height);
  printf("*** Made view bounds %f %f %f %f.\n", mView.bounds.origin.x, mView.bounds.origin.y, mView.bounds.size.width, mView.bounds.size.height);
  printf("*** Made view layer frame %f %f %f %f.\n", mView.layer.frame.origin.x, mView.layer.frame.origin.y, mView.layer.frame.size.width, mView.layer.frame.size.height);
  printf("*** Made view layer bounds %f %f %f %f.\n", mView.layer.bounds.origin.x, mView.layer.bounds.origin.y, mView.layer.bounds.size.width, mView.layer.bounds.size.height);
  printf("*** Made layer frame %f %f %f %f.\n", mRemoteLayer.frame.origin.x, mRemoteLayer.frame.origin.y, mRemoteLayer.frame.size.width, mRemoteLayer.frame.size.height);
  printf("*** Made layer bounds %f %f %f %f.\n", mRemoteLayer.bounds.origin.x, mRemoteLayer.bounds.origin.y, mRemoteLayer.bounds.size.width, mRemoteLayer.bounds.size.height);
}

IPCResult
PWAView::RecvShow(bool state) {
  [mView setHidden:!state];
  mVisible = state;
  UpdateState();

  return IPCResult::Ok();
}

IPCResult
PWAView::RecvDestroy() {
  [mView removeFromSuperview];
  mView = nullptr;

  return IPCResult::Ok();
}

}  // namespace pwa
}  // namespace mozilla
