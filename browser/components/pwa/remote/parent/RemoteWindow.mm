/* -*- Mode: C++; tab-width: 8; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set ts=8 sts=2 et sw=2 tw=80: */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "RemoteWindow.h"
#include "RemotePWA.h"
#include "mozilla/Unused.h"

namespace mozilla {
namespace pwa {

RemoteWindow::RemoteWindow() {
}

RemoteWindow::~RemoteWindow() {
  Unused << Send__delete__(this);
}

RemoteView*
RemoteWindow::CreateChildView(mozilla::LayoutDeviceIntRect bounds, CALayer* layer) {
  RemoteView* view = new RemoteView(layer);
  mViews.AppendElement(view);

  return static_cast<RemoteView*>(SendPPWAChildViewConstructor(view, bounds, view->GetLayerContextId()));
}

PPWAChildViewParent*
RemoteWindow::AllocPPWAChildViewParent(mozilla::LayoutDeviceIntRect bounds, uint32_t layerContextId) {
  MOZ_CRASH("Should never be called.");
}

bool
RemoteWindow::DeallocPPWAChildViewParent(PPWAChildViewParent* aActor) {
  RemoteView* view = static_cast<RemoteView*>(aActor);
  mViews.RemoveElement(view);
  return true;
}

RemotePWA*
RemoteWindow::remotePWA() {
  return static_cast<RemotePWA*>(Manager());
};

}  // namespace pwa
}  // namespace mozilla
