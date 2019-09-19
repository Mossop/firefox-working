/* -*- Mode: C++; tab-width: 8; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set ts=8 sts=2 et sw=2 tw=80: */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef RemoteWindow_h_
#define RemoteWindow_h_

#import <Cocoa/Cocoa.h>
#include "mozilla/pwa/PWAWindowParent.h"
#include "nsBaseWidget.h"

namespace mozilla {
namespace pwa{

class RemotePWA;
using mozilla::ipc::IPCResult;
using mozilla::widget::InputContext;

class RemoteWindow final : public nsBaseWidget, public PWAWindowParent {
 public:
  explicit RemoteWindow(RemotePWA* aPWA);
  NS_INLINE_DECL_REFCOUNTING_INHERITED(RemoteWindow, nsBaseWidget)

  CGFloat GetBackingScaleFactor();

 protected:
  typedef mozilla::LayoutDeviceIntRect LayoutDeviceIntRect;
  typedef mozilla::DesktopIntRect DesktopIntRect;

  virtual IPCResult RecvUpdateState(DesktopIntRect aOuterBounds, LayoutDeviceIntRect aInnerBounds, bool aIsVisible) override;
  virtual IPCResult RecvRequestClose() override;
  virtual IPCResult RecvActivated() override;
  virtual IPCResult RecvDeactivated() override;
  virtual PPWAViewParent* AllocPPWAViewParent(LayoutDeviceIntRect aBounds, uint32_t aContextId) override;
  virtual void DeallocPPWAViewParent(PPWAViewParent* parent) override;

 private:
  ~RemoteWindow();

  RefPtr<RemotePWA> mPWA;
  InputContext mInputContext;
  LayoutDeviceIntRect mInnerBounds;
  DesktopIntRect mOuterBounds;
  bool mIsVisible;

  // nsIWidget interface
 public:
  virtual MOZ_MUST_USE nsresult Create(nsIWidget* aParent,
      nsNativeWidget aNativeParent, const LayoutDeviceIntRect& aRect,
      nsWidgetInitData* aInitData = nullptr) override;

  virtual MOZ_MUST_USE nsresult Create(nsIWidget* aParent,
      nsNativeWidget aNativeParent, const DesktopIntRect& aRect,
      nsWidgetInitData* aInitData) override;

  virtual already_AddRefed<nsIWidget> CreateChild(
      const LayoutDeviceIntRect& aRect, nsWidgetInitData* aInitData = nullptr,
      bool aForceUseIWidgetParent = false) override;

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
