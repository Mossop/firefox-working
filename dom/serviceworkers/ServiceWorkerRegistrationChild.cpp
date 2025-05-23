/* -*- Mode: C++; tab-width: 8; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set ts=8 sts=2 et sw=2 tw=80: */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "ServiceWorkerRegistrationChild.h"

#include "ServiceWorkerRegistration.h"
#include "mozilla/dom/WorkerCommon.h"
#include "mozilla/dom/WorkerRef.h"

namespace mozilla::dom {

using mozilla::ipc::IPCResult;

void ServiceWorkerRegistrationChild::ActorDestroy(ActorDestroyReason aReason) {
  mIPCWorkerRef = nullptr;

  if (mOwner) {
    mOwner->RevokeActor(this);
    MOZ_DIAGNOSTIC_ASSERT(!mOwner);
  }
}

IPCResult ServiceWorkerRegistrationChild::RecvUpdateState(
    const IPCServiceWorkerRegistrationDescriptor& aDescriptor) {
  if (mOwner) {
    RefPtr<ServiceWorkerRegistration> owner = mOwner;
    owner->UpdateState(ServiceWorkerRegistrationDescriptor(aDescriptor));
  }
  return IPC_OK();
}

IPCResult ServiceWorkerRegistrationChild::RecvFireUpdateFound() {
  if (mOwner) {
    mOwner->FireUpdateFound();
  }
  return IPC_OK();
}

// static
RefPtr<ServiceWorkerRegistrationChild>
ServiceWorkerRegistrationChild::Create() {
  RefPtr actor = new ServiceWorkerRegistrationChild;

  if (!NS_IsMainThread()) {
    WorkerPrivate* workerPrivate = GetCurrentThreadWorkerPrivate();
    MOZ_DIAGNOSTIC_ASSERT(workerPrivate);

    RefPtr<IPCWorkerRefHelper<ServiceWorkerRegistrationChild>> helper =
        new IPCWorkerRefHelper<ServiceWorkerRegistrationChild>(actor);

    actor->mIPCWorkerRef =
        IPCWorkerRef::Create(workerPrivate, "ServiceWorkerRegistrationChild",
                             [helper] { helper->Actor()->Shutdown(); });

    if (NS_WARN_IF(!actor->mIPCWorkerRef)) {
      return nullptr;
    }
  }

  return actor;
}

ServiceWorkerRegistrationChild::ServiceWorkerRegistrationChild()
    : mOwner(nullptr) {}

void ServiceWorkerRegistrationChild::SetOwner(
    ServiceWorkerRegistration* aOwner) {
  MOZ_DIAGNOSTIC_ASSERT(!mOwner);
  MOZ_DIAGNOSTIC_ASSERT(aOwner);
  mOwner = aOwner;
}

void ServiceWorkerRegistrationChild::RevokeOwner(
    ServiceWorkerRegistration* aOwner) {
  MOZ_DIAGNOSTIC_ASSERT(mOwner);
  MOZ_DIAGNOSTIC_ASSERT(aOwner == mOwner);
  mOwner = nullptr;
}

void ServiceWorkerRegistrationChild::Shutdown() {
  if (!CanSend()) {
    return;
  }
  Unused << Send__delete__(this);
}

}  // namespace mozilla::dom
