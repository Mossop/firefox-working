/* -*- Mode: C++; tab-width: 8; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set ts=8 sts=2 et sw=2 tw=80: */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "PWAWindow.h"

@implementation PWANSWindow
- (id)initWithContentRect:(NSRect)aRect
    styleMask:(unsigned int)aMask
    window:(mozilla::pwa::PWAWindow*)aWindow
    delegate:(Delegate*)aDelegate {
  self = [super initWithContentRect:aRect
        styleMask:aMask
        backing:NSBackingStoreBuffered
        defer:YES];
  mWindow = aWindow;
  [self setDelegate:aDelegate];
  return self;
}
@end

@implementation Delegate
- (id)init:(mozilla::pwa::PWAWindow*)window {
  mWindow = window;
  return self;
}

- (void)windowDidResize:(NSNotification*)notification {
  mWindow->UpdateState();
}

- (BOOL)windowShouldClose:(id)window {
  mWindow->SendRequestClose();
  return NO;
}

- (void)windowDidBecomeKey:(id)window {
  mWindow->SendActivated();
}

- (void)windowDidResignKey:(id)window {
  mWindow->SendDeactivated();
}
@end

namespace mozilla {
namespace pwa {

// Find the screen that overlaps aRect the most,
// if none are found default to the mainScreen.
static NSScreen* FindTargetScreenForRect(const DesktopIntRect& aRect) {
  NSScreen* targetScreen = [NSScreen mainScreen];
  NSEnumerator* screenEnum = [[NSScreen screens] objectEnumerator];
  int largestIntersectArea = 0;
  while (NSScreen* screen = [screenEnum nextObject]) {
    DesktopIntRect screenRect = nsCocoaUtils::CocoaRectToGeckoRect([screen visibleFrame]);
    screenRect = screenRect.Intersect(aRect);
    int area = screenRect.width * screenRect.height;
    if (area > largestIntersectArea) {
      largestIntersectArea = area;
      targetScreen = screen;
    }
  }
  return targetScreen;
}

static unsigned int WindowMaskForBorderStyle(nsBorderStyle aBorderStyle) {
  bool allOrDefault = (aBorderStyle == eBorderStyle_all || aBorderStyle == eBorderStyle_default);

  /* Apple's docs on NSWindow styles say that "a window's style mask should
   * include NSTitledWindowMask if it includes any of the others [besides
   * NSBorderlessWindowMask]".  This implies that a borderless window
   * shouldn't have any other styles than NSBorderlessWindowMask.
   */
  if (!allOrDefault && !(aBorderStyle & eBorderStyle_title)) return NSBorderlessWindowMask;

  unsigned int mask = NSTitledWindowMask;
  if (allOrDefault || aBorderStyle & eBorderStyle_close) mask |= NSClosableWindowMask;
  if (allOrDefault || aBorderStyle & eBorderStyle_minimize) mask |= NSMiniaturizableWindowMask;
  if (allOrDefault || aBorderStyle & eBorderStyle_resizeh) mask |= NSResizableWindowMask;

  return mask;
}

PWAWindow::PWAWindow(DesktopIntRect aOuterBounds, LayoutDeviceIntRect aInnerBounds, nsBorderStyle aBorderStyle) {
  printf("*** Creating new window\n");

  NSScreen* screen = FindTargetScreenForRect(aOuterBounds);
  CGFloat scale = nsCocoaUtils::GetBackingScaleFactor(screen);
  NSRect contentRect = nsCocoaUtils::GeckoRectToCocoaRectDevPix(aInnerBounds, scale);

  unsigned int features = WindowMaskForBorderStyle(aBorderStyle);

  mDelegate = [[Delegate alloc] init:this];
  mWindow = [[PWANSWindow alloc]
      initWithContentRect:contentRect
      styleMask:features
      window:this
      delegate:mDelegate];

  [mWindow setRestorable:NO];
  [mWindow disableSnapshotRestoration];

  [mWindow setOpaque:YES];
  [mWindow setContentMinSize:NSMakeSize(60, 60)];
  [mWindow disableCursorRects];
  [mWindow setMovableByWindowBackground:NO];
  [[mWindow contentView] setWantsLayer:YES];
  [[mWindow contentView] setAutoresizesSubviews:YES];

  NSRect rect = [[mWindow contentView] frame];
  printf("*** view frame: %f %f %f %f\n", rect.origin.x, rect.origin.y, rect.size.width, rect.size.height);
  rect = [[mWindow contentView] bounds];
  printf("*** view bounds: %f %f %f %f\n", rect.origin.x, rect.origin.y, rect.size.width, rect.size.height);
}

void
PWAWindow::UpdateState() {
  CGFloat scale = nsCocoaUtils::GetBackingScaleFactor(mWindow);
  NSRect frame = [mWindow contentRectForFrameRect:[mWindow frame]];
  LayoutDeviceIntRect innerBounds = nsCocoaUtils::CocoaRectToGeckoRectDevPix(frame, scale);
  DesktopIntRect outerBounds = nsCocoaUtils::CocoaRectToGeckoRect([mWindow frame]);

  SendUpdateState(outerBounds, innerBounds, [mWindow isVisible]);
}

PPWAViewChild*
PWAWindow::AllocPPWAViewChild(mozilla::LayoutDeviceIntRect bounds, CAContextID layerContextId) {
  return new PWAView(this, [mWindow contentView], bounds, layerContextId);
}

void
PWAWindow::DeallocPPWAViewChild(PPWAViewChild* aChild) {

}

IPCResult
PWAWindow::RecvSetTitle(nsString title) {
  const unichar* uniTitle = reinterpret_cast<const unichar*>(title.get());
  NSString* nstitle = [NSString stringWithCharacters:uniTitle length:title.Length()];
  [mWindow setTitle:nstitle];

  return IPCResult::Ok();
}

IPCResult
PWAWindow::RecvShow(bool state) {
  if (state) {
    [mWindow makeKeyAndOrderFront:nil];
  } else {
    [mWindow orderOut:nil];
  }
  UpdateState();

  return IPCResult::Ok();
}

IPCResult
PWAWindow::RecvDestroy() {
  [mWindow orderOut:nil];
  [mWindow dealloc];
  mWindow = nullptr;

  return IPCResult::Ok();
}

}  // namespace pwa
}  // namespace mozilla
