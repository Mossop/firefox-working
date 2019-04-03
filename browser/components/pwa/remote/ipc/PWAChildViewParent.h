/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef PWAChildViewParent_h_
#define PWAChildViewParent_h_

#include "mozilla/pwa/PPWAChildViewParent.h"

namespace mozilla {
namespace pwa {

class PWAChildViewParent : public PPWAChildViewParent {
  friend class PPWAChildViewParent;
};

}  // namespace pwa
}  // namespace mozilla

#endif  // PWAChildViewParent_h_
