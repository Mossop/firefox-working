/* -*- Mode: C++; tab-width: 8; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set ts=8 sts=2 et sw=2 tw=80: */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef RemoteView_h_
#define RemoteView_h_

#import <Cocoa/Cocoa.h>
#import <QuartzCore/CALayer.h>
#include "mozilla/pwa/PWAViewParent.h"
#include "mozilla/layers/NativeLayerCA.h"
#include "mozilla/DataMutex.h"

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

class RemoteView final : public nsBaseWidget, public PWAViewParent {
 public:
  explicit RemoteView(RemoteWindow* aWindow);
  NS_INLINE_DECL_REFCOUNTING_INHERITED(RemoteWindow, nsBaseWidget)

  uint32_t GetLayerContextId();
  void HandleMainThreadCATransaction();

 protected:
  typedef mozilla::LayoutDeviceIntRect LayoutDeviceIntRect;
  virtual IPCResult RecvUpdateState(LayoutDeviceIntRect aBounds, bool aIsVisible) override;
  virtual IPCResult RecvUpdateLayer() override;
  virtual IPCResult RecvLiveResizeStarted() override;
  virtual IPCResult RecvLiveResizeEnded() override;

 private:
  ~RemoteView();

  void EnsureContentLayerForMainThreadPainting();
  nsIWidget* GetWidgetForListenerEvents();
  void WillPaintWindow();
  bool PaintWindow(LayoutDeviceIntRegion aRegion);
  void PaintWindowInContentLayer();
  bool PaintWindowInIOSurface(CFTypeRefPtr<IOSurfaceRef> aSurface,
                              const LayoutDeviceIntRegion& aInvalidRegion);
  bool PaintWindowInDrawTarget(gfx::DrawTarget* aDT,
                               const LayoutDeviceIntRegion& aRegion,
                               const gfx::IntSize& aSurfaceSize);
  void MaybeScheduleUnsuspendAsyncCATransactions();
  void UnsuspendAsyncCATransactions();

  RefPtr<RemoteWindow> mWindow;
  InputContext mInputContext;
  LayoutDeviceIntRect mBounds;
  bool mIsVisible;
  CAContext* mCAContext;
  CALayer* mLayer;
  bool mIsDispatchPaint;
  nsIWidget* mParentWidget;
  RefPtr<mozilla::layers::NativeLayerCA> mContentLayer;
  RefPtr<mozilla::layers::NativeLayerRootCA> mNativeLayerRoot;
  mozilla::DataMutex<LayoutDeviceIntRegion> mOpaqueRegion;
  RefPtr<mozilla::CancelableRunnable> mUnsuspendAsyncCATransactionsRunnable;

  // Coordinates the triggering of CoreAnimation transactions between the main
  // thread and the compositor thread in order to avoid glitches during window
  // resizing and window focus changes.
  struct WidgetCompositingState {
    // While mAsyncCATransactionsSuspended is true, no CoreAnimation transaction
    // should be triggered on a non-main thread, because they might race with
    // main-thread driven updates such as window shape changes, and cause glitches.
    bool mAsyncCATransactionsSuspended = false;

    // Set to true if mNativeLayerRoot->ApplyChanges() needs to be called at the
    // next available opportunity. Set to false whenever ApplyChanges does get
    // called.
    bool mNativeLayerChangesPending = false;
  };
  mozilla::DataMutex<WidgetCompositingState> mCompositingState;

  // nsIWidget interface
 public:
  virtual RefPtr<layers::NativeLayerRoot> GetNativeLayerRoot() override;
  virtual LayoutDeviceIntRegion GetOpaqueWidgetRegion() override;

  virtual MOZ_MUST_USE nsresult Create(nsIWidget* aParent,
      nsNativeWidget aNativeParent, const LayoutDeviceIntRect& aRect,
      nsWidgetInitData* aInitData = nullptr) override;

  virtual void Show(bool aState) override;
  virtual bool IsVisible() const override;
  virtual void Move(double aX, double aY) override;
  virtual void Resize(double aWidth, double aHeight, bool aRepaint) override;
  virtual void Resize(double aX, double aY, double aWidth, double aHeight,
                      bool aRepaint) override;
  virtual void Enable(bool aState) override;
  virtual bool IsEnabled() const override;

  virtual void SetFocus(Raise) override;

  virtual nsresult ConfigureChildren(
      const nsTArray<Configuration>& aConfigurations) override;

  virtual void Invalidate(const LayoutDeviceIntRect& aRect) override;

  virtual void* GetNativeData(uint32_t aDataType) override;

  virtual nsresult SetTitle(const nsAString& aTitle) override;

  virtual LayoutDeviceIntRect GetBounds() override;
  virtual LayoutDeviceIntRect GetScreenBounds() override;
  virtual LayoutDeviceIntRect GetClientBounds() override;
  virtual LayoutDeviceIntPoint WidgetToScreenOffset() override;

  virtual nsresult DispatchEvent(mozilla::WidgetGUIEvent* event,
      nsEventStatus& aStatus) override;

  virtual void SetInputContext(const InputContext& aContext,
      const InputContextAction& aAction) override;
  virtual InputContext GetInputContext() override;

  virtual void Destroy() override;
  virtual double GetDefaultScaleInternal() override;
  virtual mozilla::DesktopToLayoutDeviceScale GetDesktopToDeviceScale() override;
};

} // namespace pwa
} // namespace mozilla

#endif
