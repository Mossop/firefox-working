/* -*- Mode: C++; tab-width: 8; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set ts=8 sts=2 et sw=2 tw=80: */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "RemoteView.h"
#include "mozilla/Unused.h"
#include "nsCocoaUtils.h"
#include "CocoaPrivate.h"
#include "Layers.h"
#import <Cocoa/Cocoa.h>
#import <QuartzCore/QuartzCore.h>
#import <QuartzCore/CALayer.h>

@interface PWALayer : CALayer {
 @private
  mozilla::pwa::RemoteView* mView;
  bool mIsUpdatingLayer;
}
@end

@implementation PWALayer
- (id)init:(mozilla::pwa::RemoteView*)inView {
  mView = inView;
  mIsUpdatingLayer = NO;
  return self;
}

- (void)display {
  // printf("*** display\n");
  if (NS_IsMainThread() && mView) {
    MOZ_RELEASE_ASSERT(!mIsUpdatingLayer, "Re-entrant layer display?");
    mIsUpdatingLayer = YES;
    mView->HandleMainThreadCATransaction();
    mIsUpdatingLayer = NO;
  }
}
@end

namespace mozilla {
namespace pwa {

RemoteView::RemoteView(RemoteWindow* aWindow)
  : mWindow(aWindow),
    mIsDispatchPaint(false),
    mParentWidget(nullptr),
    mContentLayer(nullptr),
    mNativeLayerRoot(nullptr),
    mOpaqueRegion("RemoteView opaque region"),
    mCompositingState("RemoteView::mCompositingState") {
}

RemoteView::~RemoteView() {
  printf("*** RemoteView dropped\n");
  Unused << Send__delete__(this);
}

IPCResult
RemoteView::RecvUpdateState(LayoutDeviceIntRect aBounds, bool aIsVisible) {
  bool resized = mBounds.Width() != aBounds.Width() ||
                 mBounds.Height() != aBounds.Height();
  bool moved = mBounds.X() != aBounds.X() ||
               mBounds.Y() != aBounds.Y();

  mBounds = aBounds;
  mIsVisible = aIsVisible;

  if (mWidgetListener) {
    if (resized) {
      CGFloat scaleFactor = mWindow->GetBackingScaleFactor();
      NSRect rect = nsCocoaUtils::DevPixelsToCocoaPoints(mBounds, scaleFactor);
      [mLayer setBounds:rect];
      [mLayer setPosition:CGPointMake(0, 0)];
      [mLayer setAnchorPoint:CGPointMake(0, 0)];
      auto opaqueRegion = mOpaqueRegion.Lock();
      *opaqueRegion = mBounds;
      printf("*** resize %d %d %d %d\n", mBounds.x, mBounds.y, mBounds.width, mBounds.height);
      mWidgetListener->WindowResized(this, mBounds.Width(), mBounds.Height());
      Invalidate(mBounds);
    }
    if (moved) {
      mWidgetListener->WindowMoved(this, mBounds.X(), mBounds.Y());
    }
  }

  return IPCResult::Ok();
}

IPCResult
RemoteView::RecvUpdateLayer() {
  [mLayer setNeedsDisplay];
  return IPCResult::Ok();
}

IPCResult
RemoteView::RecvLiveResizeStarted() {
  mWindow->NotifyLiveResizeStarted();
  return IPCResult::Ok();
}

IPCResult
RemoteView::RecvLiveResizeEnded() {
  mWindow->NotifyLiveResizeStopped();
  return IPCResult::Ok();
}

void
RemoteView::HandleMainThreadCATransaction() {
  WillPaintWindow();

  if (GetLayerManager()->GetBackendType() == LayersBackend::LAYERS_BASIC) {
    // We're in BasicLayers mode, i.e. main thread software compositing.
    // Composite the window into our layer's surface.
    PaintWindowInContentLayer();
  } else {
    // Trigger a synchronous OMTC composite. This will call NextSurface and
    // NotifySurfaceReady on the compositor thread to update mNativeLayerRoot's
    // contents, and the main thread (this thread) will wait inside PaintWindow
    // during that time.
    PaintWindow(LayoutDeviceIntRegion(GetBounds()));
  }

  // Apply the changes inside mNativeLayerRoot to the underlying CALayers. Now is a
  // good time to call this because we know we're currently inside a main thread
  // CATransaction.
  {
    auto compositingState = mCompositingState.Lock();
    mNativeLayerRoot->ApplyChanges();
    compositingState->mNativeLayerChangesPending = false;
  }

  MaybeScheduleUnsuspendAsyncCATransactions();
}

void
RemoteView::MaybeScheduleUnsuspendAsyncCATransactions() {
  auto compositingState = mCompositingState.Lock();
  if (compositingState->mAsyncCATransactionsSuspended && !mUnsuspendAsyncCATransactionsRunnable) {
    mUnsuspendAsyncCATransactionsRunnable =
        NewCancelableRunnableMethod("RemoteView::MaybeScheduleUnsuspendAsyncCATransactions", this,
                                    &RemoteView::UnsuspendAsyncCATransactions);
    NS_DispatchToMainThread(mUnsuspendAsyncCATransactionsRunnable);
  }
}

void
RemoteView::UnsuspendAsyncCATransactions() {
  mUnsuspendAsyncCATransactionsRunnable = nullptr;

  auto compositingState = mCompositingState.Lock();
  compositingState->mAsyncCATransactionsSuspended = false;
  if (compositingState->mNativeLayerChangesPending) {
    // We need to call mNativeLayerRoot->ApplyChanges() at the next available
    // opportunity, and it needs to happen during a CoreAnimation transaction.
    // The easiest way to handle this request is to mark the layer as needing
    // display, because this will schedule a main thread CATransaction, during
    // which HandleMainThreadCATransaction will call ApplyChanges().
    [mLayer setNeedsDisplay];
  }
}

nsIWidget*
RemoteView::GetWidgetForListenerEvents() {
  // If there is no listener, use the parent popup's listener if that exists.
  if (!mWidgetListener && mParentWidget && mParentWidget->WindowType() == eWindowType_popup) {
    return mParentWidget;
  }

  return this;
}

void
RemoteView::WillPaintWindow() {
  nsCOMPtr<nsIWidget> widget = GetWidgetForListenerEvents();

  nsIWidgetListener* listener = widget->GetWidgetListener();
  if (listener) {
    listener->WillPaintWindow(widget);
  }
}

bool
RemoteView::PaintWindow(LayoutDeviceIntRegion aRegion) {
  nsCOMPtr<nsIWidget> widget = GetWidgetForListenerEvents();

  nsIWidgetListener* listener = widget->GetWidgetListener();
  if (!listener) return false;

  bool returnValue = false;
  bool oldDispatchPaint = mIsDispatchPaint;
  mIsDispatchPaint = true;
  returnValue = listener->PaintWindow(widget, aRegion);

  listener = widget->GetWidgetListener();
  if (listener) {
    listener->DidPaintWindow();
  }

  mIsDispatchPaint = oldDispatchPaint;
  return returnValue;
}

void
RemoteView::EnsureContentLayerForMainThreadPainting() {
  if (!mContentLayer) {
    // The content layer gets created on demand for BasicLayers windows. We do
    // not create it during widget creation because, for non-BasicLayers windows,
    // the compositing layer manager will create any layers it needs.
    RefPtr<mozilla::layers::NativeLayer> contentLayer = mNativeLayerRoot->CreateLayer();
    mNativeLayerRoot->AppendLayer(contentLayer);
    mContentLayer = contentLayer->AsNativeLayerCA();
  }
}

bool
RemoteView::PaintWindowInIOSurface(CFTypeRefPtr<IOSurfaceRef> aSurface,
                                   const LayoutDeviceIntRegion& aInvalidRegion) {
  RefPtr<MacIOSurface> surf = new MacIOSurface(std::move(aSurface));
  surf->Lock(false);
  RefPtr<gfx::DrawTarget> dt = surf->GetAsDrawTargetLocked(gfx::BackendType::SKIA);
  bool result = PaintWindowInDrawTarget(dt, aInvalidRegion, dt->GetSize());
  surf->Unlock(false);
  return result;
}

bool
RemoteView::PaintWindowInDrawTarget(gfx::DrawTarget* aDT,
                                    const LayoutDeviceIntRegion& aRegion,
                                    const gfx::IntSize& aSurfaceSize) {
  RefPtr<gfxContext> targetContext = gfxContext::CreateOrNull(aDT);
  MOZ_ASSERT(targetContext);

  // Set up the clip region and clear existing contents in the backing surface.
  targetContext->NewPath();
  for (auto iter = aRegion.RectIter(); !iter.Done(); iter.Next()) {
    const LayoutDeviceIntRect& r = iter.Get();
    targetContext->Rectangle(gfxRect(r.x, r.y, r.width, r.height));
    aDT->ClearRect(gfx::Rect(r.ToUnknownRect()));
  }
  targetContext->Clip();

  if (GetLayerManager()->GetBackendType() == LayersBackend::LAYERS_BASIC) {
    nsBaseWidget::AutoLayerManagerSetup setupLayerManager(this, targetContext,
                                                          BufferMode::BUFFER_NONE);
    return PaintWindow(aRegion);
  }
  if (GetLayerManager()->GetBackendType() == LayersBackend::LAYERS_CLIENT) {
    // We only need this so that we actually get DidPaintWindow fired
    return PaintWindow(aRegion);
  }
  return false;
}

void
RemoteView::PaintWindowInContentLayer() {
  EnsureContentLayerForMainThreadPainting();
  mContentLayer->SetRect(GetBounds().ToUnknownRect());
  {
    auto opaqueRegion = mOpaqueRegion.Lock();
    mContentLayer->SetOpaqueRegion(opaqueRegion->ToUnknownRegion());
  }
  mContentLayer->SetSurfaceIsFlipped(false);
  CFTypeRefPtr<IOSurfaceRef> surf = mContentLayer->NextSurface();
  if (!surf) {
    return;
  }

  PaintWindowInIOSurface(
      surf, LayoutDeviceIntRegion::FromUnknownRegion(mContentLayer->CurrentSurfaceInvalidRegion()));
  mContentLayer->NotifySurfaceReady();
}

RefPtr<layers::NativeLayerRoot>
RemoteView::GetNativeLayerRoot() {
  return mNativeLayerRoot;
}

LayoutDeviceIntRegion
RemoteView::GetOpaqueWidgetRegion() {
  auto opaqueRegion = mOpaqueRegion.Lock();
  return *opaqueRegion;
}

nsresult
RemoteView::Create(nsIWidget* aParent,
    nsNativeWidget aNativeParent, const LayoutDeviceIntRect& aRect,
    nsWidgetInitData* aInitData) {
  mBounds = aRect;
  auto opaqueRegion = mOpaqueRegion.Lock();
  *opaqueRegion = mBounds;

  mParentWidget = aParent;

  BaseCreate(aParent, aInitData);

  printf("*** Creating a RemoteView %d %d %d %d\n", aRect.x, aRect.y, aRect.width, aRect.height);

  CGFloat scaleFactor = mWindow->GetBackingScaleFactor();
  printf("*** scaleFactor: %f\n", scaleFactor);
  NSRect rect = nsCocoaUtils::DevPixelsToCocoaPoints(mBounds, scaleFactor);
  printf("*** Cocoa rect: %f %f %f %f\n", rect.origin.x, rect.origin.y, rect.size.width, rect.size.height);

  mLayer = [[PWALayer layer] init:this];
  [mLayer setBounds:rect];
  [mLayer setAnchorPoint:CGPointMake(0, 0)];
  [mLayer setContentsScale:scaleFactor];
  [mLayer setContentsGravity:kCAGravityTopLeft];

  mNativeLayerRoot = mozilla::layers::NativeLayerRootCA::CreateForCALayer(mLayer);
  mNativeLayerRoot->SetBackingScale(scaleFactor);

  NSDictionary* dict = [[NSDictionary alloc] init];
  CGSConnection connection_id = _CGSDefaultConnection();
  mCAContext = [CAContext contextWithCGSConnection:connection_id options:dict];
  if (!mCAContext) {
    return NS_ERROR_FAILURE;
  }

  [mCAContext retain];
  [mCAContext setLayer:mLayer];

  if (!mWindow->SendPPWAViewConstructor(this, aRect, [mCAContext contextId])) {
    return NS_ERROR_FAILURE;
  }

  return NS_OK;
}

void
RemoteView::Show(bool aState) {
  printf("*** RemoteView Show %d\n", aState);
  Unused << SendShow(aState);
  if (aState) {
    mWindow->Show(true);
    Invalidate(mBounds);
  }
}

bool
RemoteView::IsVisible() const {
  return mIsVisible;
}

void
RemoteView::Move(double aX, double aY) {
}

void
RemoteView::Resize(double aWidth, double aHeight, bool aRepaint) {
}

void
RemoteView::Resize(double aX, double aY, double aWidth, double aHeight,
    bool aRepaint) {
}

void
RemoteView::Enable(bool aState) {
}

bool
RemoteView::IsEnabled() const {
  return true;
}

void
RemoteView::SetFocus(Raise) {
}

nsresult
RemoteView::ConfigureChildren(
    const nsTArray<Configuration>& aConfigurations) {
  return NS_OK;
}

void
RemoteView::Invalidate(const LayoutDeviceIntRect& aRect) {
  printf("*** Invalidate\n");
  EnsureContentLayerForMainThreadPainting();
  mContentLayer->InvalidateRegionThroughoutSwapchain(aRect.ToUnknownRect());
  [mLayer setNeedsDisplay];
}

void*
RemoteView::GetNativeData(uint32_t aDataType) {
  return nullptr;
}

nsresult
RemoteView::SetTitle(const nsAString& aTitle) {
  return NS_OK;
}

LayoutDeviceIntRect
RemoteView::GetBounds() {
  // Outside dimensions in screen coordinates.
  return mBounds;
}

LayoutDeviceIntRect
RemoteView::GetScreenBounds() {
  // Outside dimensions in device coordinates.
  return GetBounds();
}

LayoutDeviceIntRect
RemoteView::GetClientBounds() {
  // Inner dimensions in screen coordinates.
  return mBounds;
}

LayoutDeviceIntPoint
RemoteView::WidgetToScreenOffset() {
  // Widget's origin in screen coordinates.
  return GetScreenBounds().TopLeft();
}

nsresult
RemoteView::DispatchEvent(mozilla::WidgetGUIEvent* event,
    nsEventStatus& aStatus) {
  return NS_OK;
}

void
RemoteView::SetInputContext(const InputContext& aContext,
    const InputContextAction& aAction) {
  mInputContext = aContext;
}

InputContext
RemoteView::GetInputContext() {
  return mInputContext;
}

void
RemoteView::Destroy() {
  printf("*** Destroy RemoteView\n");
  Unused << SendDestroy();
  nsBaseWidget::Destroy();
  NotifyWindowDestroyed();
  nsBaseWidget::OnDestroy();
}

double
RemoteView::GetDefaultScaleInternal() {
  return mWindow->GetDefaultScaleInternal();
}

mozilla::DesktopToLayoutDeviceScale
RemoteView::GetDesktopToDeviceScale() {
  return mozilla::DesktopToLayoutDeviceScale(GetDefaultScaleInternal());
}

}  // namespace pwa
}  // namespace mozilla
