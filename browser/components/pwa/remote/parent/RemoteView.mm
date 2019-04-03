/* -*- Mode: C++; tab-width: 8; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set ts=8 sts=2 et sw=2 tw=80: */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "RemoteView.h"
#include "mozilla/Unused.h"
#include "CocoaPrivate.h"
#import <QuartzCore/CALayer.h>

#define ENSURE(x) \
  do { \
    if (!(x)) { \
      fprintf(stderr, "Check %s failed at %s:%d\n", #x, __FILE__, __LINE__); \
      exit(1); \
    } \
  } while (0)

namespace mozilla {
namespace pwa {

RemoteView::RemoteView(CALayer* layer) {
  mLayer = layer;

  NSDictionary* dict = [[NSDictionary alloc] init];
  CGSConnection connection_id = _CGSDefaultConnection();
  mCAContext = [CAContext contextWithCGSConnection:connection_id options:dict];
  [mCAContext retain];
  ENSURE(mCAContext);
  [mCAContext setLayer:mLayer];
  ENSURE([mCAContext layer]);
  printf("*** Sending layer %u %f %f %f %f.\n", [mCAContext contextId], mLayer.frame.origin.x, mLayer.frame.origin.y, mLayer.frame.size.width, mLayer.frame.size.height);
}

RemoteView::~RemoteView() {
  Unused << Send__delete__(this);
}

uint32_t
RemoteView::GetLayerContextId() {
  return [mCAContext contextId];
}

}  // namespace pwa
}  // namespace mozilla
