/* -*- Mode: C++; tab-width: 8; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set ts=8 sts=2 et sw=2 tw=80: */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "RemoteWindow.h"
#include "RemotePWA.h"
#include "RemoteView.h"
#include "mozilla/Unused.h"
#include "nsCocoaUtils.h"

namespace mozilla {
namespace pwa {

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

// fits the rect to the screen that contains the largest area of it,
// or to aScreen if a screen is passed in
// NB: this operates with aRect in desktop pixels
static void FitRectToVisibleAreaForScreen(DesktopIntRect& aRect, NSScreen* aScreen) {
  if (!aScreen) {
    aScreen = FindTargetScreenForRect(aRect);
  }

  DesktopIntRect screenBounds = nsCocoaUtils::CocoaRectToGeckoRect([aScreen visibleFrame]);

  if (aRect.width > screenBounds.width) {
    aRect.width = screenBounds.width;
  }
  if (aRect.height > screenBounds.height) {
    aRect.height = screenBounds.height;
  }

  if (aRect.x - screenBounds.x + aRect.width > screenBounds.width) {
    aRect.x += screenBounds.width - (aRect.x - screenBounds.x + aRect.width);
  }
  if (aRect.y - screenBounds.y + aRect.height > screenBounds.height) {
    aRect.y += screenBounds.height - (aRect.y - screenBounds.y + aRect.height);
  }

  // If the left/top edge of the window is off the screen in either direction,
  // then set the window to start at the left/top edge of the screen.
  if (aRect.x < screenBounds.x || aRect.x > (screenBounds.x + screenBounds.width)) {
    aRect.x = screenBounds.x;
  }
  if (aRect.y < screenBounds.y || aRect.y > (screenBounds.y + screenBounds.height)) {
    aRect.y = screenBounds.y;
  }
}

RemoteWindow::RemoteWindow(RemotePWA* aPWA)
    : mPWA(aPWA),
      mIsVisible(false) {
  printf("*** Created RemoteWindow\n");
}

RemoteWindow::~RemoteWindow() {
  printf("*** RemoteWindow dropped\n");
  Unused << Send__delete__(this);
}

CGFloat
RemoteWindow::GetBackingScaleFactor() {
  NSScreen* screen = FindTargetScreenForRect(mOuterBounds);
  return nsCocoaUtils::GetBackingScaleFactor(screen);
}

IPCResult
RemoteWindow::RecvUpdateState(DesktopIntRect aOuterBounds, LayoutDeviceIntRect aInnerBounds, bool aIsVisible) {
  bool resized = mOuterBounds.Width() != aOuterBounds.Width() ||
                 mOuterBounds.Height() != aOuterBounds.Height();
  bool moved = mOuterBounds.X() != aOuterBounds.X() ||
               mOuterBounds.Y() != aOuterBounds.Y();

  mOuterBounds = aOuterBounds;
  mInnerBounds = aInnerBounds;
  mIsVisible = aIsVisible;

  if (mWidgetListener) {
    if (resized) {
      mWidgetListener->WindowResized(this, mOuterBounds.Width(), mOuterBounds.Height());
    }
    if (moved) {
      mWidgetListener->WindowMoved(this, mOuterBounds.X(), mOuterBounds.Y());
    }
  }

  return IPCResult::Ok();
}

IPCResult
RemoteWindow::RecvRequestClose() {
  if (mWidgetListener) {
    mWidgetListener->RequestWindowClose(this);
  }
  return IPCResult::Ok();
}

IPCResult
RemoteWindow::RecvActivated() {
  if (mWidgetListener) {
    mWidgetListener->WindowActivated();
  }
  return IPCResult::Ok();
}

IPCResult
RemoteWindow::RecvDeactivated() {
  if (mWidgetListener) {
    mWidgetListener->WindowDeactivated();
  }
  return IPCResult::Ok();
}

PPWAViewParent*
RemoteWindow::AllocPPWAViewParent(LayoutDeviceIntRect aBounds, uint32_t aContextId) {
  MOZ_CRASH("Unreachable");
  return nullptr;
}

void
RemoteWindow::DeallocPPWAViewParent(PPWAViewParent* parent) {
}

// nsIWidget implementation

nsresult
RemoteWindow::Create(nsIWidget* aParent,
    nsNativeWidget aNativeParent, const LayoutDeviceIntRect& aRect,
    nsWidgetInitData* aInitData) {
  MOZ_CRASH("Unsupported.");
}

nsresult
RemoteWindow::Create(nsIWidget* aParent,
    nsNativeWidget aNativeParent, const DesktopIntRect& aRect,
    nsWidgetInitData* aInitData) {
  // The origin of aRect is the origin of the window. The width and height are
  // the width and height of the content area.
  printf("*** Create\n");

  mBorderStyle = eBorderStyle_default;
  BaseCreate(aParent, aInitData);

  DesktopIntRect rect = aRect;

  FitRectToVisibleAreaForScreen(rect, nullptr);

  // The bounds are needed immediately after this function returns so calculate
  // them now.
  NSRect contentRect = nsCocoaUtils::GeckoRectToCocoaRect(rect);
  unsigned int styleMask = WindowMaskForBorderStyle(mBorderStyle);
  NSRect frameRect = [NSWindow frameRectForContentRect:contentRect styleMask:styleMask];

  // We were already given the origin of the frame, set that on the frame and
  // adjust the origin of the content.
  contentRect.origin.y -= (frameRect.size.height - contentRect.size.height);
  contentRect.origin.y -= [[NSApp mainMenu] menuBarHeight];

  mOuterBounds = nsCocoaUtils::CocoaRectToGeckoRect(frameRect);

  NSScreen* screen = FindTargetScreenForRect(mOuterBounds);
  CGFloat scale = nsCocoaUtils::GetBackingScaleFactor(screen);
  mInnerBounds = nsCocoaUtils::CocoaRectToGeckoRectDevPix(contentRect, scale);

  if (!mPWA->SendPPWAWindowConstructor(this, mOuterBounds, mInnerBounds, mBorderStyle)) {
    return NS_ERROR_FAILURE;
  }

  printf("*** Created\n");

  return NS_OK;
}

already_AddRefed<nsIWidget> RemoteWindow::CreateChild(
    const LayoutDeviceIntRect& aRect, nsWidgetInitData* aInitData,
    bool aForceUseIWidgetParent) {
  nsIWidget* parent = this;
  nsNativeWidget nativeParent = nullptr;

  if (!aForceUseIWidgetParent) {
    // Use only either parent or nativeParent, not both, to match
    // existing code.  Eventually Create() should be divested of its
    // nativeWidget parameter.
    nativeParent = parent ? parent->GetNativeData(NS_NATIVE_WIDGET) : nullptr;
    parent = nativeParent ? nullptr : parent;
    MOZ_ASSERT(!parent || !nativeParent, "messed up logic");
  }

  nsCOMPtr<nsIWidget> widget;
  if (aInitData && aInitData->mWindowType == eWindowType_popup) {
    widget = new RemoteWindow(mPWA);
  } else {
    widget = new RemoteView(this);
  }

  if (widget &&
      NS_SUCCEEDED(widget->Create(parent, nativeParent, aRect, aInitData))) {
    return widget.forget();
  }

  return nullptr;
}

void
RemoteWindow::Show(bool aState) {
  printf("*** RemoteWindow Show %d\n", aState);
  Unused << SendShow(aState);
}

bool
RemoteWindow::IsVisible() const {
  return mIsVisible;
}

void
RemoteWindow::Move(double aX, double aY) {
}

void
RemoteWindow::Resize(double aWidth, double aHeight, bool aRepaint) {
}

void
RemoteWindow::Resize(double aX, double aY, double aWidth, double aHeight,
    bool aRepaint) {
}

void
RemoteWindow::Enable(bool aState) {
}

bool
RemoteWindow::IsEnabled() const {
  return true;
}

void
RemoteWindow::SetFocus(Raise) {
}

nsresult
RemoteWindow::ConfigureChildren(
    const nsTArray<Configuration>& aConfigurations) {
  return NS_OK;
}

void
RemoteWindow::Invalidate(const LayoutDeviceIntRect& aRect) {
  printf("*** Window Invalidate\n");
}

void*
RemoteWindow::GetNativeData(uint32_t aDataType) {
  return nullptr;
}

nsresult
RemoteWindow::SetTitle(const nsAString& aTitle) {
  return SendSetTitle(PromiseFlatString(aTitle)) ? NS_OK : NS_ERROR_FAILURE;
}

LayoutDeviceIntRect
RemoteWindow::GetBounds() {
  // Outside dimensions in screen coordinates.
  NSScreen* screen = FindTargetScreenForRect(mOuterBounds);
  NSRect rect = nsCocoaUtils::GeckoRectToCocoaRect(mOuterBounds);
  CGFloat scale = nsCocoaUtils::GetBackingScaleFactor(screen);
  return nsCocoaUtils::CocoaRectToGeckoRectDevPix(rect, scale);
}

LayoutDeviceIntRect
RemoteWindow::GetScreenBounds() {
  // Outside dimensions in device coordinates.
  return GetBounds();
}

LayoutDeviceIntRect
RemoteWindow::GetClientBounds() {
  // Inner dimensions in screen coordinates.
  return mInnerBounds;
}

LayoutDeviceIntPoint
RemoteWindow::WidgetToScreenOffset() {
  // Widget's origin in screen coordinates.
  return GetScreenBounds().TopLeft();
}

nsresult
RemoteWindow::DispatchEvent(mozilla::WidgetGUIEvent* event,
    nsEventStatus& aStatus) {
  return NS_OK;
}

void
RemoteWindow::SetInputContext(const InputContext& aContext,
    const InputContextAction& aAction) {
  mInputContext = aContext;
}

InputContext
RemoteWindow::GetInputContext() {
  return mInputContext;
}

void
RemoteWindow::Destroy() {
  printf("*** Destroy RemoteWindow\n");
  Unused << SendDestroy();
  nsBaseWidget::Destroy();
  NotifyWindowDestroyed();
  nsBaseWidget::OnDestroy();
}

double
RemoteWindow::GetDefaultScaleInternal() {
  NSScreen* screen = FindTargetScreenForRect(mOuterBounds);
  return nsCocoaUtils::GetBackingScaleFactor(screen);
}


mozilla::DesktopToLayoutDeviceScale
RemoteWindow::GetDesktopToDeviceScale() {
  return mozilla::DesktopToLayoutDeviceScale(GetDefaultScaleInternal());
}

}  // namespace pwa
}  // namespace mozilla
