/* -*- Mode: C++; tab-width: 8; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set ts=8 sts=2 et sw=2 tw=80: */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "PWAWindow.h"

void updateLayer(CALayer* layer) {
  for (uint32_t i = 0; i < [layer sublayers].count; i++) {
    updateLayer([layer sublayers][i]);
  }

  [layer setNeedsDisplay];
}

void
updateView(NSView* view) {
  for (uint32_t i = 0; i < [view subviews].count; i++) {
    updateView([view subviews][i]);
  }

  updateLayer([view layer]);
}

@implementation RemoteWindow
- (void)keyDown:(NSEvent *)event {
  if ([event isARepeat])
    return;

  NSString *characters = [event charactersIgnoringModifiers];
  if ([characters length] != 1)
    return;

  switch ([characters characterAtIndex:0]) {
    case 'r': {
        printf("Redrawing\n");
        updateView(_contentView);
      }
      break;
  }
}
@end

namespace mozilla {
namespace pwa {

PWAWindow::PWAWindow() {
  mWindow = [[RemoteWindow alloc]
      initWithContentRect:NSMakeRect(0, 0, 1024, 500)
                styleMask:NSTitledWindowMask
                  backing:NSBackingStoreBuffered
                    defer:NO];

  [[mWindow contentView] setWantsLayer:YES];

  [mWindow setTitle:@"PWA"];
  [mWindow makeKeyAndOrderFront:nil];
}

PPWAChildViewChild*
PWAWindow::AllocPPWAChildViewChild(mozilla::LayoutDeviceIntRect bounds, CAContextID layerContextId) {
  return new PWAView([mWindow contentView], bounds, layerContextId);
}

bool
PWAWindow::DeallocPPWAChildViewChild(PPWAChildViewChild* aActor) {
  return true;
}

IPCResult
PWAWindow::RecvSetTitle(nsString title) {
  const unichar* uniTitle = reinterpret_cast<const unichar*>(title.get());
  NSString* nstitle = [NSString stringWithCharacters:uniTitle length:title.Length()];
  [mWindow setTitle:nstitle];

  return IPCResult::Ok();
}

}  // namespace pwa
}  // namespace mozilla
