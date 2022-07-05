/* -*- Mode: c++; tab-width: 2; indent-tabs-mode: nil; -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "nsIMacDockSupport.h"
#include "nsIStandaloneNativeMenu.h"
#include "nsITaskbarProgress.h"
#include "nsCOMPtr.h"
#include "nsString.h"
#include "imgINotificationObserver.h"
#include "imgIContainer.h"
#include "nsColor.h"

class imgRequestProxy;

@class MOZProgressDockOverlayView;

class nsMacDockSupport : public nsIMacDockSupport, public nsITaskbarProgress, public imgINotificationObserver {
 public:
  nsMacDockSupport();

  NS_DECL_ISUPPORTS
  NS_DECL_NSIMACDOCKSUPPORT
  NS_DECL_NSITASKBARPROGRESS
  NS_DECL_IMGINOTIFICATIONOBSERVER

 protected:
  virtual ~nsMacDockSupport();

  nsCOMPtr<nsIStandaloneNativeMenu> mDockMenu;
  nsString mBadgeText;

  NSView* mDockTileWrapperView;
  NSImageView* mDockBadgeView;
  NSImage* mDockBadgeImage;
  MOZProgressDockOverlayView* mProgressDockOverlayView;

  bool mHasBadgeColor;
  nscolor mBadgeColor;
  nsTaskbarProgressState mProgressState;
  double mProgressFraction;

  RefPtr<imgRequestProxy> mIconRequest;

  nsresult UpdateBadgeIcon(imgIContainer* aImage);

  nsresult BuildDockTile();
  void ReleaseDockTile();
  nsresult UpdateDockTile();
};
