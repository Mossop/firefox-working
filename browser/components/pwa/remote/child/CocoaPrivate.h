/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef ChildCocoaPrivate_h_
#define ChildCocoaPrivate_h_

typedef uint32_t CAContextID;

@interface CALayerHost : CALayer
{
}
@property CAContextID contextId;
@end

#endif  // ChildCocoaPrivate_h_
