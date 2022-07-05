/* -*- Mode: c++; tab-width: 2; indent-tabs-mode: nil; -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#import <Cocoa/Cocoa.h>
#include "ErrorList.h"
#include <CoreFoundation/CoreFoundation.h>
#include <signal.h>

#include "nsCocoaUtils.h"
#include "nsComponentManagerUtils.h"
#include "nsMacDockSupport.h"
#include "nsObjCExceptions.h"
#include "nsNativeThemeColors.h"
#include "nsString.h"
#include "imgLoader.h"
#include "imgRequestProxy.h"
#include "MOZIconHelper.h"
#include "mozilla/SVGImageContext.h"

NS_IMPL_ISUPPORTS(nsMacDockSupport, nsIMacDockSupport, nsITaskbarProgress, imgINotificationObserver)

// This view is used in the dock tile when we're downloading a file.
// It draws a progress bar that looks similar to the native progress bar on
// 10.12. This style of progress bar is not animated, unlike the pre-10.10
// progress bar look which had to redrawn multiple times per second.
@interface MOZProgressDockOverlayView : NSView {
  double mFractionValue;
}
@property double fractionValue;

@end

@implementation MOZProgressDockOverlayView

@synthesize fractionValue = mFractionValue;

- (void)drawRect:(NSRect)aRect {
  // Erase the background behind this view, i.e. cut a rectangle hole in the icon.
  [[NSColor clearColor] set];
  NSRectFill(self.bounds);

  // Split the height of this view into four quarters. The middle two quarters
  // will be covered by the actual progress bar.
  CGFloat radius = self.bounds.size.height / 4;
  NSRect barBounds = NSInsetRect(self.bounds, 0, radius);

  NSBezierPath* path = [NSBezierPath bezierPathWithRoundedRect:barBounds
                                                       xRadius:radius
                                                       yRadius:radius];

  // Draw a grayish background first.
  [[NSColor colorWithDeviceWhite:0 alpha:0.1] setFill];
  [path fill];

  // Draw a fill in the control accent color for the progress part.
  NSRect progressFillRect = self.bounds;
  progressFillRect.size.width *= mFractionValue;
  [NSGraphicsContext saveGraphicsState];
  [NSBezierPath clipRect:progressFillRect];
  [ControlAccentColor() setFill];
  [path fill];
  [NSGraphicsContext restoreGraphicsState];

  // Add a shadowy stroke on top.
  [NSGraphicsContext saveGraphicsState];
  [path addClip];
  [[NSColor colorWithDeviceWhite:0 alpha:0.2] setStroke];
  path.lineWidth = barBounds.size.height / 10;
  [path stroke];
  [NSGraphicsContext restoreGraphicsState];
}

@end

nsMacDockSupport::nsMacDockSupport()
    : mDockTileWrapperView(nil),
      mDockBadgeView(nil),
      mDockBadgeImage(nil),
      mProgressDockOverlayView(nil),
      mHasBadgeColor(false),
      mBadgeColor(0),
      mProgressState(STATE_NO_PROGRESS),
      mProgressFraction(0.0) {}

nsMacDockSupport::~nsMacDockSupport() {
  ReleaseDockTile();
}

NS_IMETHODIMP
nsMacDockSupport::GetDockMenu(nsIStandaloneNativeMenu** aDockMenu) {
  nsCOMPtr<nsIStandaloneNativeMenu> dockMenu(mDockMenu);
  dockMenu.forget(aDockMenu);
  return NS_OK;
}

NS_IMETHODIMP
nsMacDockSupport::SetDockMenu(nsIStandaloneNativeMenu* aDockMenu) {
  mDockMenu = aDockMenu;
  return NS_OK;
}

NS_IMETHODIMP
nsMacDockSupport::SetDockIcon(nsIURI* aIcon, const nsAString& aColor) {
  if (!aIcon) {
    if (mDockBadgeView) {
      mDockBadgeView.image = [MOZIconHelper placeholderIconWithSize:NSMakeSize(128, 128)];
    }
    if (mDockBadgeImage) {
      [mDockBadgeImage release];
      mDockBadgeImage = nil;
    }

    return UpdateDockTile();
  }

  if (aColor.IsVoid()) {
    mHasBadgeColor = false;
  } else if (NS_HexToRGBA(aColor, nsHexColorType::NoAlpha, &mBadgeColor)) {
    mHasBadgeColor = true;
  } else {
    return NS_ERROR_FAILURE;
  }

  RefPtr<imgLoader> loader = imgLoader::NormalLoader();

  return loader->LoadImage(
    aIcon, nullptr, nullptr, nullptr, 0, nullptr, this, nullptr, nullptr, nsIRequest::LOAD_NORMAL,
    nullptr, nsIContentPolicy::TYPE_INTERNAL_IMAGE, u""_ns, false, false, 0,
    getter_AddRefs(mIconRequest)
  );
}

void nsMacDockSupport::Notify(imgIRequest* aRequest, int32_t aType,
                              const nsIntRect* aRect) {
  if (aType == imgINotificationObserver::FRAME_COMPLETE) {
    nsCOMPtr<imgIContainer> image;
    aRequest->GetImage(getter_AddRefs(image));
    MOZ_ASSERT(image);

    UpdateBadgeIcon(image);
  }

  if (aType == imgINotificationObserver::DECODE_COMPLETE) {
    aRequest->Cancel(NS_BINDING_ABORTED);
    mIconRequest = nullptr;
  }

  if (aType == imgINotificationObserver::LOAD_COMPLETE) {
    // Make sure the image loaded successfully.
    uint32_t status = imgIRequest::STATUS_ERROR;
    if (NS_FAILED(aRequest->GetImageStatus(&status)) ||
        (status & imgIRequest::STATUS_ERROR)) {
      mIconRequest->Cancel(NS_BINDING_ABORTED);
      mIconRequest = nullptr;
      return;
    }

    nsCOMPtr<imgIContainer> image;
    aRequest->GetImage(getter_AddRefs(image));
    MOZ_ASSERT(image);

    // Ask the image to decode at its intrinsic size.
    int32_t width = 0, height = 0;
    image->GetWidth(&width);
    image->GetHeight(&height);
    image->RequestDecodeForSize(nsIntSize(width, height),
                                imgIContainer::FLAG_HIGH_QUALITY_SCALING);
  }
}

nsresult nsMacDockSupport::UpdateBadgeIcon(imgIContainer* aImage) {
  NS_OBJC_BEGIN_TRY_BLOCK_RETURN

  mozilla::SVGImageContext svgContext;
  if (mHasBadgeColor) {
    auto contextPaint = mozilla::MakeRefPtr<mozilla::SVGEmbeddingContextPaint>();
    contextPaint->SetFill(mBadgeColor);
    svgContext.SetContextPaint(contextPaint);
  }

  mDockBadgeImage = [[MOZIconHelper iconImageFromImageContainer:aImage
                                    withSize:NSMakeSize(128, 128)
                                    svgContext:svgContext
                                    scaleFactor:0.0] retain];

  if (mDockBadgeView) {
    mDockBadgeView.image = mDockBadgeImage;
  }

  return UpdateDockTile();

  NS_OBJC_END_TRY_BLOCK_RETURN(NS_ERROR_FAILURE)
}

NS_IMETHODIMP
nsMacDockSupport::ActivateApplication(bool aIgnoreOtherApplications) {
  NS_OBJC_BEGIN_TRY_BLOCK_RETURN;

  [[NSApplication sharedApplication] activateIgnoringOtherApps:aIgnoreOtherApplications];
  return NS_OK;

  NS_OBJC_END_TRY_BLOCK_RETURN(NS_ERROR_FAILURE);
}

NS_IMETHODIMP
nsMacDockSupport::SetBadgeText(const nsAString& aBadgeText) {
  NS_OBJC_BEGIN_TRY_BLOCK_RETURN;

  NSDockTile* tile = [[NSApplication sharedApplication] dockTile];
  mBadgeText = aBadgeText;
  if (aBadgeText.IsEmpty())
    [tile setBadgeLabel:nil];
  else
    [tile setBadgeLabel:[NSString
                            stringWithCharacters:reinterpret_cast<const unichar*>(mBadgeText.get())
                                          length:mBadgeText.Length()]];
  return NS_OK;

  NS_OBJC_END_TRY_BLOCK_RETURN(NS_ERROR_FAILURE);
}

NS_IMETHODIMP
nsMacDockSupport::GetBadgeText(nsAString& aBadgeText) {
  aBadgeText = mBadgeText;
  return NS_OK;
}

NS_IMETHODIMP
nsMacDockSupport::SetProgressState(nsTaskbarProgressState aState, uint64_t aCurrentValue,
                                   uint64_t aMaxValue) {
  NS_ENSURE_ARG_RANGE(aState, 0, STATE_PAUSED);
  if (aState == STATE_NO_PROGRESS || aState == STATE_INDETERMINATE) {
    NS_ENSURE_TRUE(aCurrentValue == 0, NS_ERROR_INVALID_ARG);
    NS_ENSURE_TRUE(aMaxValue == 0, NS_ERROR_INVALID_ARG);
  }
  if (aCurrentValue > aMaxValue) {
    return NS_ERROR_ILLEGAL_VALUE;
  }

  mProgressState = aState;
  if (aMaxValue == 0) {
    mProgressFraction = 0;
  } else {
    mProgressFraction = (double)aCurrentValue / aMaxValue;
  }

  return UpdateDockTile();
}

void nsMacDockSupport::ReleaseDockTile() {
  if (!mDockTileWrapperView) {
    return;
  }

  [mDockTileWrapperView release];
  mDockTileWrapperView = nil;
  [mProgressDockOverlayView release];
  mProgressDockOverlayView = nil;
  [mDockBadgeView release];
  mDockBadgeView = nil;

  if (mDockBadgeImage) {
    [mDockBadgeImage release];
    mDockBadgeImage = nil;
  }
}

nsresult nsMacDockSupport::BuildDockTile() {
  NS_OBJC_BEGIN_TRY_BLOCK_RETURN;

  if (mProgressState != STATE_NORMAL && mProgressState != STATE_INDETERMINATE && !mDockBadgeImage) {
    ReleaseDockTile();
    return NS_OK;
  }

  if (mDockTileWrapperView) {
    return NS_OK;
  }

  // Create the following NSView hierarchy:
  // * mDockTileWrapperView (NSView)
  //    * imageView (NSImageView) <- has the application icon
  //    * mDockBadgeView (NSImageView) <- has the dock badge
  //    * mProgressDockOverlayView (MOZProgressDockOverlayView) <- draws the progress bar

  mDockTileWrapperView = [[NSView alloc] initWithFrame:NSMakeRect(0, 0, 32, 32)];
  mDockTileWrapperView.autoresizingMask = NSViewWidthSizable | NSViewHeightSizable;

  NSImageView* imageView = [[NSImageView alloc] initWithFrame:[mDockTileWrapperView bounds]];
  imageView.image = [NSImage imageNamed:@"NSApplicationIcon"];
  imageView.imageScaling = NSImageScaleAxesIndependently;
  imageView.autoresizingMask = NSViewWidthSizable | NSViewHeightSizable;
  [mDockTileWrapperView addSubview:imageView];

  NSImageView* mDockBadgeView = [[NSImageView alloc] initWithFrame:NSMakeRect(0, 16, 16, 16)];
  if (mDockBadgeImage) {
    mDockBadgeView.image = mDockBadgeImage;
  } else {
    mDockBadgeView.image = [MOZIconHelper placeholderIconWithSize:NSMakeSize(128, 128)];
  }
  mDockBadgeView.imageScaling = NSImageScaleProportionallyUpOrDown;
  mDockBadgeView.autoresizingMask = NSViewMinXMargin | NSViewWidthSizable |
                                    NSViewMaxXMargin | NSViewMinYMargin |
                                    NSViewHeightSizable | NSViewMaxYMargin;
  [mDockTileWrapperView addSubview:mDockBadgeView];

  mProgressDockOverlayView =
      [[MOZProgressDockOverlayView alloc] initWithFrame:NSMakeRect(1, 3, 30, 4)];
  mProgressDockOverlayView.autoresizingMask = NSViewMinXMargin | NSViewWidthSizable |
                                              NSViewMaxXMargin | NSViewMinYMargin |
                                              NSViewHeightSizable | NSViewMaxYMargin;
  [mDockTileWrapperView addSubview:mProgressDockOverlayView];

  return NS_OK;

  NS_OBJC_END_TRY_BLOCK_RETURN(NS_ERROR_FAILURE);
}

nsresult nsMacDockSupport::UpdateDockTile() {
  MOZ_TRY(BuildDockTile());

  NS_OBJC_BEGIN_TRY_BLOCK_RETURN;

  if (!mDockTileWrapperView) {
    NSApp.dockTile.contentView = nil;
    [NSApp.dockTile display];

    return NS_OK;
  }

  if (NSApp.dockTile.contentView != mDockTileWrapperView) {
    NSApp.dockTile.contentView = mDockTileWrapperView;
  }

  if (mProgressState == STATE_NORMAL) {
    mProgressDockOverlayView.fractionValue = mProgressFraction;
    mProgressDockOverlayView.hidden = false;
  } else if (mProgressState == STATE_INDETERMINATE) {
    // Indeterminate states are rare. Just fill the entire progress bar in
    // that case.
    mProgressDockOverlayView.fractionValue = 1.0;
    mProgressDockOverlayView.hidden = false;
  } else {
    mProgressDockOverlayView.hidden = true;
  }

  [NSApp.dockTile display];

  return NS_OK;

  NS_OBJC_END_TRY_BLOCK_RETURN(NS_ERROR_FAILURE);
}

extern "C" {
// Private CFURL API used by the Dock.
CFPropertyListRef _CFURLCopyPropertyListRepresentation(CFURLRef url);
CFURLRef _CFURLCreateFromPropertyListRepresentation(CFAllocatorRef alloc,
                                                    CFPropertyListRef pListRepresentation);
}  // extern "C"

namespace {

const NSArray* const browserAppNames =
    [NSArray arrayWithObjects:@"Firefox.app", @"Firefox Beta.app", @"Firefox Nightly.app",
                              @"Safari.app", @"WebKit.app", @"Google Chrome.app",
                              @"Google Chrome Canary.app", @"Chromium.app", @"Opera.app", nil];

constexpr NSString* const kDockDomainName = @"com.apple.dock";
// See https://developer.apple.com/documentation/devicemanagement/dock
constexpr NSString* const kDockPersistentAppsKey = @"persistent-apps";
// See https://developer.apple.com/documentation/devicemanagement/dock/staticitem
constexpr NSString* const kDockTileDataKey = @"tile-data";
constexpr NSString* const kDockFileDataKey = @"file-data";

NSArray* GetPersistentAppsFromDockPlist(NSDictionary* aDockPlist) {
  if (!aDockPlist) {
    return nil;
  }
  NSArray* persistentApps = [aDockPlist objectForKey:kDockPersistentAppsKey];
  if (![persistentApps isKindOfClass:[NSArray class]]) {
    return nil;
  }
  return persistentApps;
}

NSString* GetPathForApp(NSDictionary* aPersistantApp) {
  if (![aPersistantApp isKindOfClass:[NSDictionary class]]) {
    return nil;
  }
  NSDictionary* tileData = aPersistantApp[kDockTileDataKey];
  if (![tileData isKindOfClass:[NSDictionary class]]) {
    return nil;
  }
  NSDictionary* fileData = tileData[kDockFileDataKey];
  if (![fileData isKindOfClass:[NSDictionary class]]) {
    // Some special tiles may not have DockFileData but we can ignore those.
    return nil;
  }
  NSURL* url = CFBridgingRelease(_CFURLCreateFromPropertyListRepresentation(NULL, fileData));
  if (!url) {
    return nil;
  }
  return [url isFileURL] ? [url path] : nullptr;
}

// The only reliable way to get our changes to take effect seems to be to use
// `kill`.
void RefreshDock(NSDictionary* aDockPlist) {
  [[NSUserDefaults standardUserDefaults] setPersistentDomain:aDockPlist forName:kDockDomainName];
  NSRunningApplication* dockApp = [[NSRunningApplication
      runningApplicationsWithBundleIdentifier:@"com.apple.dock"] firstObject];
  if (!dockApp) {
    return;
  }
  pid_t pid = [dockApp processIdentifier];
  if (pid > 0) {
    kill(pid, SIGTERM);
  }
}

}  // namespace

nsresult nsMacDockSupport::GetIsAppInDock(bool* aIsInDock) {
  NS_OBJC_BEGIN_TRY_BLOCK_RETURN;

  *aIsInDock = false;

  NSDictionary* dockPlist =
      [[NSUserDefaults standardUserDefaults] persistentDomainForName:kDockDomainName];
  if (!dockPlist) {
    return NS_ERROR_FAILURE;
  }

  NSArray* persistentApps = GetPersistentAppsFromDockPlist(dockPlist);
  if (!persistentApps) {
    return NS_ERROR_FAILURE;
  }

  NSString* appPath = [[NSBundle mainBundle] bundlePath];

  for (id app in persistentApps) {
    NSString* persistentAppPath = GetPathForApp(app);
    if (persistentAppPath && [appPath isEqual:persistentAppPath]) {
      *aIsInDock = true;
      break;
    }
  }

  return NS_OK;

  NS_OBJC_END_TRY_BLOCK_RETURN(NS_ERROR_FAILURE);
}

nsresult nsMacDockSupport::EnsureAppIsPinnedToDock(const nsAString& aAppPath,
                                                   const nsAString& aAppToReplacePath,
                                                   bool* aIsInDock) {
  NS_OBJC_BEGIN_TRY_BLOCK_RETURN;

  MOZ_ASSERT(aAppPath != aAppToReplacePath || !aAppPath.IsEmpty());

  *aIsInDock = false;

  NSString* appPath =
      !aAppPath.IsEmpty() ? nsCocoaUtils::ToNSString(aAppPath) : [[NSBundle mainBundle] bundlePath];
  NSString* appToReplacePath = nsCocoaUtils::ToNSString(aAppToReplacePath);

  NSMutableDictionary* dockPlist =
      [NSMutableDictionary dictionaryWithDictionary:[[NSUserDefaults standardUserDefaults]
                                                        persistentDomainForName:kDockDomainName]];
  if (!dockPlist) {
    return NS_ERROR_FAILURE;
  }

  NSMutableArray* persistentApps =
      [NSMutableArray arrayWithArray:GetPersistentAppsFromDockPlist(dockPlist)];
  if (!persistentApps) {
    return NS_ERROR_FAILURE;
  }

  // See the comment for this method in the .idl file for the strategy that we
  // use here to determine where to pin the app.
  NSUInteger preexistingAppIndex = NSNotFound;  // full path matches
  NSUInteger sameNameAppIndex = NSNotFound;     // app name matches only
  NSUInteger toReplaceAppIndex = NSNotFound;
  NSUInteger lastBrowserAppIndex = NSNotFound;
  for (NSUInteger index = 0; index < [persistentApps count]; ++index) {
    NSString* persistentAppPath = GetPathForApp([persistentApps objectAtIndex:index]);

    if ([persistentAppPath isEqualToString:appPath]) {
      preexistingAppIndex = index;
    } else if (appToReplacePath && [persistentAppPath isEqualToString:appToReplacePath]) {
      toReplaceAppIndex = index;
    } else {
      NSString* appName = [appPath lastPathComponent];
      NSString* persistentAppName = [persistentAppPath lastPathComponent];

      if ([persistentAppName isEqual:appName]) {
        if ([appToReplacePath hasPrefix:@"/private/var/folders/"] &&
            [appToReplacePath containsString:@"/AppTranslocation/"] &&
            [persistentAppPath hasPrefix:@"/Volumes/"]) {
          // This is a special case when an app with the same name was
          // previously dragged and pinned from a quarantined DMG straight to
          // the Dock and an attempt is now made to pin the same named app to
          // the Dock. In this case we want to replace the currently pinned app
          // icon.
          toReplaceAppIndex = index;
        } else {
          sameNameAppIndex = index;
        }
      } else {
        if ([browserAppNames containsObject:persistentAppName]) {
          lastBrowserAppIndex = index;
        }
      }
    }
  }

  // Special cases where we're not going to add a new Dock tile:
  if (preexistingAppIndex != NSNotFound) {
    if (toReplaceAppIndex != NSNotFound) {
      [persistentApps removeObjectAtIndex:toReplaceAppIndex];
      [dockPlist setObject:persistentApps forKey:kDockPersistentAppsKey];
      RefreshDock(dockPlist);
    }
    *aIsInDock = true;
    return NS_OK;
  }

  // Create new tile:
  NSDictionary* newDockTile = nullptr;
  {
    NSURL* appUrl = [NSURL fileURLWithPath:appPath isDirectory:YES];
    NSDictionary* dict =
        CFBridgingRelease(_CFURLCopyPropertyListRepresentation((__bridge CFURLRef)appUrl));
    if (!dict) {
      return NS_ERROR_FAILURE;
    }
    NSDictionary* dockTileData = [NSDictionary dictionaryWithObject:dict forKey:kDockFileDataKey];
    if (dockTileData) {
      newDockTile = [NSDictionary dictionaryWithObject:dockTileData forKey:kDockTileDataKey];
    }
    if (!newDockTile) {
      return NS_ERROR_FAILURE;
    }
  }

  // Update the Dock:
  if (toReplaceAppIndex != NSNotFound) {
    [persistentApps replaceObjectAtIndex:toReplaceAppIndex withObject:newDockTile];
  } else {
    NSUInteger index;
    if (sameNameAppIndex != NSNotFound) {
      index = sameNameAppIndex + 1;
    } else if (lastBrowserAppIndex != NSNotFound) {
      index = lastBrowserAppIndex + 1;
    } else {
      index = [persistentApps count];
    }
    [persistentApps insertObject:newDockTile atIndex:index];
  }
  [dockPlist setObject:persistentApps forKey:kDockPersistentAppsKey];
  RefreshDock(dockPlist);

  *aIsInDock = true;
  return NS_OK;

  NS_OBJC_END_TRY_BLOCK_RETURN(NS_ERROR_FAILURE);
}
