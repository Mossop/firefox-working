/* -*- Mode: C++; tab-width: 8; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set ts=8 sts=2 et sw=2 tw=80: */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef mozilla_dom_PerformanceWorker_h
#define mozilla_dom_PerformanceWorker_h

#include "Performance.h"

namespace mozilla::dom {

class WorkerGlobalScope;
class PerformanceInteractionMetrics;

class PerformanceWorker final : public Performance {
 public:
  explicit PerformanceWorker(WorkerGlobalScope* aGlobalScope);

  PerformanceStorage* AsPerformanceStorage() override {
    MOZ_CRASH("This should not be called on workers.");
    return nullptr;
  }

  virtual PerformanceTiming* Timing() override {
    MOZ_CRASH("This should not be called on workers.");
    return nullptr;
  }

  virtual PerformanceNavigation* Navigation() override {
    MOZ_CRASH("This should not be called on workers.");
    return nullptr;
  }

  virtual void SetFCPTimingEntry(PerformancePaintTiming* aEntry) override {
    MOZ_CRASH("This should not be called on workers.");
  }

  TimeStamp CreationTimeStamp() const override;

  DOMHighResTimeStamp CreationTime() const override;

  virtual void GetMozMemory(JSContext* aCx,
                            JS::MutableHandle<JSObject*> aObj) override {
    MOZ_CRASH("This should not be called on workers.");
  }

  virtual nsDOMNavigationTiming* GetDOMTiming() const override {
    MOZ_CRASH("This should not be called on workers.");
    return nullptr;
  }

  virtual uint64_t GetRandomTimelineSeed() override;

  virtual nsITimedChannel* GetChannel() const override {
    MOZ_CRASH("This should not be called on workers.");
    return nullptr;
  }

  void QueueNavigationTimingEntry() override {
    MOZ_CRASH("This should not be called on workers.");
  }

  void UpdateNavigationTimingEntry() override {
    MOZ_CRASH("This should not be called on workers.");
  }

  void InsertEventTimingEntry(PerformanceEventTiming*) override {
    MOZ_CRASH("This should not be called on workers.");
  }

  void BufferEventTimingEntryIfNeeded(PerformanceEventTiming*) override {
    MOZ_CRASH("This should not be called on workers.");
  }

  void DispatchPendingEventTimingEntries() override {
    MOZ_CRASH("This should not be called on workders.");
  }

  PerformanceInteractionMetrics& GetPerformanceInteractionMetrics() override {
    MOZ_CRASH("This should not be called on workers.");
  }

  void SetInteractionId(PerformanceEventTiming* aEventTiming,
                        const WidgetEvent* aEvent) override {
    MOZ_CRASH("This should not be called on workers.");
  }

  class EventCounts* EventCounts() override {
    MOZ_CRASH("This should not be called on workers");
  }

  uint64_t InteractionCount() override {
    MOZ_CRASH("This should not be called on workers");
  }

 protected:
  ~PerformanceWorker();

  void InsertUserEntry(PerformanceEntry* aEntry) override;

  void DispatchBufferFullEvent() override {
    // Nothing to do here. See bug 1432758.
  }
};

}  // namespace mozilla::dom

#endif  // mozilla_dom_PerformanceWorker_h
