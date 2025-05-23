/* -*- Mode: C++; tab-width: 20; indent-tabs-mode: nil; c-basic-offset: 2 -*-
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "DeviceManagerDx.h"
#include "D3D11Checks.h"
#include "gfxConfig.h"
#include "GfxDriverInfo.h"
#include "gfxWindowsPlatform.h"
#include "mozilla/D3DMessageUtils.h"
#include "mozilla/StaticPrefs_gfx.h"
#include "mozilla/StaticPrefs_layers.h"
#include "mozilla/glean/GfxMetrics.h"
#include "mozilla/gfx/GPUParent.h"
#include "mozilla/gfx/GPUProcessManager.h"
#include "mozilla/gfx/GraphicsMessages.h"
#include "mozilla/gfx/Logging.h"
#include "mozilla/gfx/gfxVars.h"
#include "mozilla/layers/CompositorBridgeChild.h"
#include "mozilla/layers/CompositorThread.h"
#include "mozilla/layers/DeviceAttachmentsD3D11.h"
#include "mozilla/Preferences.h"
#include "nsPrintfCString.h"
#include "nsString.h"

// -

#include <d3d11.h>
#include <dcomp.h>
#include <ddraw.h>
#include <dxgi.h>

namespace mozilla {
namespace gfx {

using namespace mozilla::widget;
using namespace mozilla::layers;

StaticAutoPtr<DeviceManagerDx> DeviceManagerDx::sInstance;

// We don't have access to the D3D11CreateDevice type in gfxWindowsPlatform.h,
// since it doesn't include d3d11.h, so we use a static here. It should only
// be used within InitializeD3D11.
decltype(D3D11CreateDevice)* sD3D11CreateDeviceFn = nullptr;

// It should only be used within CreateDirectCompositionDevice.
decltype(DCompositionCreateDevice2)* sDcompCreateDevice2Fn = nullptr;
decltype(DCompositionCreateDevice3)* sDcompCreateDevice3Fn = nullptr;

// It should only be used within CreateDCompSurfaceHandle
decltype(DCompositionCreateSurfaceHandle)* sDcompCreateSurfaceHandleFn =
    nullptr;

/* static */
void DeviceManagerDx::Init() { sInstance = new DeviceManagerDx(); }

/* static */
void DeviceManagerDx::Shutdown() { sInstance = nullptr; }

DeviceManagerDx::DeviceManagerDx()
    : mDeviceLock("gfxWindowsPlatform.mDeviceLock"),
      mCompositorDeviceSupportsVideo(false) {
  // Set up the D3D11 feature levels we can ask for.
  mFeatureLevels.AppendElement(D3D_FEATURE_LEVEL_11_1);
  mFeatureLevels.AppendElement(D3D_FEATURE_LEVEL_11_0);
  mFeatureLevels.AppendElement(D3D_FEATURE_LEVEL_10_1);
  mFeatureLevels.AppendElement(D3D_FEATURE_LEVEL_10_0);
  MOZ_COUNT_CTOR(DeviceManagerDx);
}

DeviceManagerDx::~DeviceManagerDx() { MOZ_COUNT_DTOR(DeviceManagerDx); }

bool DeviceManagerDx::LoadD3D11() {
  FeatureState& d3d11 = gfxConfig::GetFeature(Feature::D3D11_COMPOSITING);
  MOZ_ASSERT(d3d11.IsEnabled());

  if (sD3D11CreateDeviceFn) {
    return true;
  }

  nsModuleHandle module(LoadLibrarySystem32(L"d3d11.dll"));
  if (!module) {
    d3d11.SetFailed(FeatureStatus::Unavailable,
                    "Direct3D11 not available on this computer",
                    "FEATURE_FAILURE_D3D11_LIB"_ns);
    return false;
  }

  sD3D11CreateDeviceFn =
      (decltype(D3D11CreateDevice)*)GetProcAddress(module, "D3D11CreateDevice");
  if (!sD3D11CreateDeviceFn) {
    // We should just be on Windows Vista or XP in this case.
    d3d11.SetFailed(FeatureStatus::Unavailable,
                    "Direct3D11 not available on this computer",
                    "FEATURE_FAILURE_D3D11_FUNCPTR"_ns);
    return false;
  }

  mD3D11Module.steal(module);
  return true;
}

bool DeviceManagerDx::LoadDcomp() {
  MOZ_ASSERT(gfxConfig::GetFeature(Feature::D3D11_COMPOSITING).IsEnabled());
  MOZ_ASSERT(gfxVars::UseWebRenderANGLE());
  MOZ_ASSERT(gfxVars::UseWebRenderDCompWin());

  if (sDcompCreateDevice2Fn) {
    return true;  // Already loaded.
  }

  nsModuleHandle module(LoadLibrarySystem32(L"dcomp.dll"));
  if (!module) {
    return false;
  }

  sDcompCreateDevice2Fn = (decltype(DCompositionCreateDevice2)*)GetProcAddress(
      module, "DCompositionCreateDevice2");
  sDcompCreateDevice3Fn = (decltype(DCompositionCreateDevice3)*)GetProcAddress(
      module, "DCompositionCreateDevice3");
  if (!sDcompCreateDevice2Fn) {
    return false;
  }

  // Load optional API for external compositing
  sDcompCreateSurfaceHandleFn =
      (decltype(DCompositionCreateSurfaceHandle)*)::GetProcAddress(
          module, "DCompositionCreateSurfaceHandle");

  mDcompModule.steal(module);
  return true;
}

void DeviceManagerDx::ReleaseD3D11() {
  MOZ_ASSERT(!mCompositorDevice);
  MOZ_ASSERT(!mContentDevice);
  MOZ_ASSERT(!mVRDevice);
  MOZ_ASSERT(!mDecoderDevice);

  mD3D11Module.reset();
  sD3D11CreateDeviceFn = nullptr;
}

nsTArray<DXGI_OUTPUT_DESC1> DeviceManagerDx::EnumerateOutputs() {
  RefPtr<IDXGIAdapter> adapter = GetDXGIAdapter();

  if (!adapter) {
    NS_WARNING("Failed to acquire a DXGI adapter for enumerating outputs.");
    return nsTArray<DXGI_OUTPUT_DESC1>();
  }

  nsTArray<DXGI_OUTPUT_DESC1> outputs;
  for (UINT i = 0;; ++i) {
    RefPtr<IDXGIOutput> output = nullptr;
    if (FAILED(adapter->EnumOutputs(i, getter_AddRefs(output)))) {
      break;
    }

    RefPtr<IDXGIOutput6> output6 = nullptr;
    if (FAILED(output->QueryInterface(__uuidof(IDXGIOutput6),
                                      getter_AddRefs(output6)))) {
      break;
    }

    DXGI_OUTPUT_DESC1 desc;
    if (FAILED(output6->GetDesc1(&desc))) {
      break;
    }

    outputs.AppendElement(desc);
  }
  return outputs;
}

bool DeviceManagerDx::GetOutputFromMonitor(HMONITOR monitor,
                                           RefPtr<IDXGIOutput>* aOutOutput) {
  RefPtr<IDXGIAdapter> adapter = GetDXGIAdapter();

  if (!adapter) {
    NS_WARNING("Failed to acquire a DXGI adapter for GetOutputFromMonitor.");
    return false;
  }

  for (UINT i = 0;; ++i) {
    RefPtr<IDXGIOutput> output = nullptr;
    if (FAILED(adapter->EnumOutputs(i, getter_AddRefs(output)))) {
      break;
    }

    DXGI_OUTPUT_DESC desc;
    if (FAILED(output->GetDesc(&desc))) {
      continue;
    }

    if (desc.Monitor == monitor) {
      *aOutOutput = output;
      return true;
    }
  }
  return false;
}

void DeviceManagerDx::PostUpdateMonitorInfo() {
  MOZ_ASSERT(XRE_IsGPUProcess());
  MOZ_ASSERT(NS_IsMainThread());

  MutexAutoLock lock(mDeviceLock);
  // Reduce frequency of UpdateMonitorInfo() call.
  if (mUpdateMonitorInfoRunnable) {
    return;
  }

  auto* holder = CompositorThreadHolder::GetSingleton();
  if (!holder) {
    return;
  }

  mUpdateMonitorInfoRunnable = NS_NewRunnableFunction(
      "DeviceManagerDx::PostUpdateMonitorInfo::Runnable", []() -> void {
        auto* dm = gfx::DeviceManagerDx::Get();
        if (dm) {
          dm->UpdateMonitorInfo();
        }
      });

  const uint32_t kDelayMS = 100;
  RefPtr<Runnable> runnable = mUpdateMonitorInfoRunnable;
  holder->GetCompositorThread()->DelayedDispatch(runnable.forget(), kDelayMS);
}

static bool ColorSpaceIsHDR(const DXGI_OUTPUT_DESC1& aDesc) {
  // Set isHDR to true if the output has a BT2020 colorspace with EOTF2084
  // gamma curve, this indicates the system is sending an HDR format to
  // this monitor.  The colorspace returned by DXGI is very vague - we only
  // see DXGI_COLOR_SPACE_RGB_FULL_G2084_NONE_P2020 for HDR and
  // DXGI_COLOR_SPACE_RGB_FULL_G22_NONE_P709 for SDR modes, even if the
  // monitor is using something like YCbCr444 according to Settings
  // (System -> Display Settings -> Advanced Display).  To get more specific
  // info we would need to query the DISPLAYCONFIG values in WinGDI.
  //
  // Note that we don't check bit depth here, since as of Windows 11 22H2,
  // HDR is supported with 8bpc for lower bandwidth, where DWM converts to
  // dithered RGB8 rather than RGB10, which doesn't really matter here.
  //
  // Since RefreshScreens(), the caller of this function, is triggered
  // by WM_DISPLAYCHANGE, this will pick up changes to the monitors in
  // all the important cases (resolution/color changes by the user).
  //
  // Further reading:
  // https://learn.microsoft.com/en-us/windows/win32/direct3darticles/high-dynamic-range
  // https://learn.microsoft.com/en-us/windows/win32/api/wingdi/ns-wingdi-displayconfig_sdr_white_level
  bool isHDR = (aDesc.ColorSpace == DXGI_COLOR_SPACE_RGB_FULL_G2084_NONE_P2020);

  return isHDR;
}

void DeviceManagerDx::UpdateMonitorInfo() {
  bool systemHdrEnabled = false;
  std::set<HMONITOR> hdrMonitors;

  for (const auto desc : EnumerateOutputs()) {
    if (ColorSpaceIsHDR(desc)) {
      systemHdrEnabled = true;
      hdrMonitors.emplace(desc.Monitor);
    }
  }

  {
    MutexAutoLock lock(mDeviceLock);
    mSystemHdrEnabled = Some(systemHdrEnabled);
    mHdrMonitors.swap(hdrMonitors);
    mUpdateMonitorInfoRunnable = nullptr;
  }
}

bool DeviceManagerDx::SystemHDREnabled() {
  {
    MutexAutoLock lock(mDeviceLock);
    if (mSystemHdrEnabled.isSome()) {
      return mSystemHdrEnabled.ref();
    }
  }

  UpdateMonitorInfo();

  MutexAutoLock lock(mDeviceLock);
  return mSystemHdrEnabled.ref();
}

bool DeviceManagerDx::WindowHDREnabled(HWND aWindow) {
  MOZ_ASSERT(aWindow);

  HMONITOR monitor = ::MonitorFromWindow(aWindow, MONITOR_DEFAULTTONEAREST);
  return MonitorHDREnabled(monitor);
}

bool DeviceManagerDx::MonitorHDREnabled(HMONITOR aMonitor) {
  if (!aMonitor) {
    return false;
  }

  bool needInit = false;

  {
    MutexAutoLock lock(mDeviceLock);
    if (mSystemHdrEnabled.isNothing()) {
      needInit = true;
    }
  }

  if (needInit) {
    UpdateMonitorInfo();
  }

  MutexAutoLock lock(mDeviceLock);
  MOZ_ASSERT(mSystemHdrEnabled.isSome());

  auto it = mHdrMonitors.find(aMonitor);
  if (it == mHdrMonitors.end()) {
    return false;
  }

  return true;
}

void DeviceManagerDx::CheckHardwareStretchingSupport(HwStretchingSupport& aRv) {
  RefPtr<IDXGIAdapter> adapter = GetDXGIAdapter();

  if (!adapter) {
    NS_WARNING(
        "Failed to acquire a DXGI adapter for checking hardware stretching "
        "support.");
    ++aRv.mError;
    return;
  }

  for (UINT i = 0;; ++i) {
    RefPtr<IDXGIOutput> output = nullptr;
    HRESULT result = adapter->EnumOutputs(i, getter_AddRefs(output));
    if (result == DXGI_ERROR_NOT_FOUND) {
      // No more outputs to check.
      break;
    }

    if (FAILED(result)) {
      ++aRv.mError;
      break;
    }

    RefPtr<IDXGIOutput6> output6 = nullptr;
    if (FAILED(output->QueryInterface(__uuidof(IDXGIOutput6),
                                      getter_AddRefs(output6)))) {
      ++aRv.mError;
      continue;
    }

    UINT flags = 0;
    if (FAILED(output6->CheckHardwareCompositionSupport(&flags))) {
      ++aRv.mError;
      continue;
    }

    bool fullScreen = flags & DXGI_HARDWARE_COMPOSITION_SUPPORT_FLAG_FULLSCREEN;
    bool window = flags & DXGI_HARDWARE_COMPOSITION_SUPPORT_FLAG_WINDOWED;
    if (fullScreen && window) {
      ++aRv.mBoth;
    } else if (fullScreen) {
      ++aRv.mFullScreenOnly;
    } else if (window) {
      ++aRv.mWindowOnly;
    } else {
      ++aRv.mNone;
    }
  }
}

#ifdef DEBUG
static inline bool ProcessOwnsCompositor() {
  return XRE_GetProcessType() == GeckoProcessType_GPU ||
         XRE_GetProcessType() == GeckoProcessType_VR ||
         (XRE_IsParentProcess() && !gfxConfig::IsEnabled(Feature::GPU_PROCESS));
}
#endif

bool DeviceManagerDx::CreateCompositorDevices() {
  MutexAutoLock lock(mDeviceLock);
  return CreateCompositorDevicesLocked();
}

bool DeviceManagerDx::CreateCompositorDevicesLocked() {
  MOZ_ASSERT(ProcessOwnsCompositor());

  FeatureState& d3d11 = gfxConfig::GetFeature(Feature::D3D11_COMPOSITING);
  MOZ_ASSERT(d3d11.IsEnabled());

  if (int32_t sleepSec =
          StaticPrefs::gfx_direct3d11_sleep_on_create_device_AtStartup()) {
    printf_stderr("Attach to PID: %lu\n", GetCurrentProcessId());
    Sleep(sleepSec * 1000);
  }

  if (!LoadD3D11()) {
    return false;
  }

  CreateCompositorDevice(d3d11);

  if (!d3d11.IsEnabled()) {
    MOZ_ASSERT(!mCompositorDevice);
    ReleaseD3D11();

    return false;
  }

  // We leak these everywhere and we need them our entire runtime anyway, let's
  // leak it here as well. We keep the pointer to sD3D11CreateDeviceFn around
  // as well for D2D1 and device resets.
  mD3D11Module.disown();

  MOZ_ASSERT(mCompositorDevice);
  if (!d3d11.IsEnabled()) {
    return false;
  }

  // When WR is used, do not preload attachments for D3D11 Non-WR compositor.
  //
  // Fallback from WR to D3D11 Non-WR compositor without re-creating gpu process
  // could happen when WR causes error. In this case, the attachments are loaded
  // synchronously.
  if (gfx::gfxVars::UseSoftwareWebRender()) {
    PreloadAttachmentsOnCompositorThread();
  }

  return true;
}

bool DeviceManagerDx::CreateVRDevice() {
  MOZ_ASSERT(ProcessOwnsCompositor());

  if (mVRDevice) {
    return true;
  }

  if (!gfxConfig::IsEnabled(Feature::D3D11_COMPOSITING)) {
    NS_WARNING("Direct3D11 Compositing required for VR");
    return false;
  }

  if (!LoadD3D11()) {
    return false;
  }

  RefPtr<IDXGIAdapter1> adapter = GetDXGIAdapterLocked();
  if (!adapter) {
    NS_WARNING("Failed to acquire a DXGI adapter for VR");
    return false;
  }

  UINT flags = D3D11_CREATE_DEVICE_BGRA_SUPPORT;

  HRESULT hr;
  if (!CreateDevice(adapter, D3D_DRIVER_TYPE_UNKNOWN, flags, hr, mVRDevice)) {
    gfxCriticalError() << "Crash during D3D11 device creation for VR";
    return false;
  }

  if (FAILED(hr) || !mVRDevice) {
    NS_WARNING("Failed to acquire a D3D11 device for VR");
    return false;
  }

  return true;
}

bool DeviceManagerDx::CreateCanvasDevice() {
  MutexAutoLock lock(mDeviceLock);
  return CreateCanvasDeviceLocked();
}

bool DeviceManagerDx::CreateCanvasDeviceLocked() {
  MOZ_ASSERT(ProcessOwnsCompositor());

  if (mCanvasDevice) {
    return true;
  }

  if (!LoadD3D11()) {
    return false;
  }

  RefPtr<IDXGIAdapter1> adapter = GetDXGIAdapterLocked();
  if (!adapter) {
    NS_WARNING("Failed to acquire a DXGI adapter for Canvas");
    return false;
  }

  UINT flags = D3D11_CREATE_DEVICE_BGRA_SUPPORT;

  HRESULT hr;
  if (!CreateDevice(adapter, D3D_DRIVER_TYPE_UNKNOWN, flags, hr,
                    mCanvasDevice)) {
    gfxCriticalError() << "Crash during D3D11 device creation for Canvas";
    return false;
  }

  if (StaticPrefs::
          gfx_direct2d_target_independent_rasterization_disabled_AtStartup()) {
    int creationFlags = 0x2;  // disable target independent rasterization
    const GUID D2D_INTERNAL_DEVICE_CREATION_OPTIONS = {
        0xfb3a8e1a,
        0x2e3c,
        0x4de1,
        {0x84, 0x42, 0x40, 0x43, 0xe0, 0xb0, 0x94, 0x95}};
    mCanvasDevice->SetPrivateData(D2D_INTERNAL_DEVICE_CREATION_OPTIONS,
                                  sizeof(creationFlags), &creationFlags);
  }

  if (FAILED(hr) || !mCanvasDevice) {
    NS_WARNING("Failed to acquire a D3D11 device for Canvas");
    return false;
  }

  if (!D3D11Checks::DoesTextureSharingWork(mCanvasDevice)) {
    mCanvasDevice = nullptr;
    return false;
  }

  if (XRE_IsGPUProcess()) {
    Factory::SetDirect3D11Device(mCanvasDevice);
  }

  return true;
}

void DeviceManagerDx::CreateDirectCompositionDevice() {
  MutexAutoLock lock(mDeviceLock);
  CreateDirectCompositionDeviceLocked();
}

void DeviceManagerDx::CreateDirectCompositionDeviceLocked() {
  if (!gfxVars::UseWebRenderDCompWin()) {
    return;
  }

  if (!mCompositorDevice) {
    return;
  }

  if (!LoadDcomp()) {
    return;
  }

  RefPtr<IDXGIDevice> dxgiDevice;
  if (mCompositorDevice->QueryInterface(
          IID_PPV_ARGS((IDXGIDevice**)getter_AddRefs(dxgiDevice))) != S_OK) {
    return;
  }

  HRESULT hr;
  RefPtr<IDCompositionDesktopDevice> desktopDevice;
  MOZ_SEH_TRY {
    hr = sDcompCreateDevice3Fn(
        dxgiDevice.get(),
        IID_PPV_ARGS(
            (IDCompositionDesktopDevice**)getter_AddRefs(desktopDevice)));
    if (!desktopDevice) {
      hr = sDcompCreateDevice2Fn(
          dxgiDevice.get(),
          IID_PPV_ARGS(
              (IDCompositionDesktopDevice**)getter_AddRefs(desktopDevice)));
    }
  }
  MOZ_SEH_EXCEPT(EXCEPTION_EXECUTE_HANDLER) { return; }

  if (!SUCCEEDED(hr)) {
    return;
  }

  RefPtr<IDCompositionDevice2> compositionDevice;
  if (desktopDevice->QueryInterface(IID_PPV_ARGS(
          (IDCompositionDevice2**)getter_AddRefs(compositionDevice))) != S_OK) {
    return;
  }

  mDirectCompositionDevice = compositionDevice;
}

/* static */
HANDLE DeviceManagerDx::CreateDCompSurfaceHandle() {
  if (!sDcompCreateSurfaceHandleFn) {
    return 0;
  }

  HANDLE handle = 0;
  HRESULT hr = sDcompCreateSurfaceHandleFn(COMPOSITIONOBJECT_ALL_ACCESS,
                                           nullptr, &handle);
  if (FAILED(hr)) {
    return 0;
  }

  return handle;
}

void DeviceManagerDx::ImportDeviceInfo(const D3D11DeviceStatus& aDeviceStatus) {
  MOZ_ASSERT(!ProcessOwnsCompositor());

  MutexAutoLock lock(mDeviceLock);
  mDeviceStatus = Some(aDeviceStatus);
}

bool DeviceManagerDx::ExportDeviceInfo(D3D11DeviceStatus* aOut) {
  MutexAutoLock lock(mDeviceLock);
  if (mDeviceStatus) {
    *aOut = mDeviceStatus.value();
    return true;
  }

  return false;
}

void DeviceManagerDx::CreateContentDevices() {
  MutexAutoLock lock(mDeviceLock);
  CreateContentDevicesLocked();
}

void DeviceManagerDx::CreateContentDevicesLocked() {
  MOZ_ASSERT(gfxConfig::IsEnabled(Feature::D3D11_COMPOSITING));

  if (!LoadD3D11()) {
    return;
  }

  // We should have been assigned a DeviceStatus from the parent process,
  // GPU process, or the same process if using in-process compositing.
  MOZ_RELEASE_ASSERT(mDeviceStatus);

  if (CreateContentDevice() == FeatureStatus::CrashedInHandler) {
    DisableD3D11AfterCrash();
  }
}

already_AddRefed<IDXGIAdapter1> DeviceManagerDx::GetDXGIAdapter() {
  MutexAutoLock lock(mDeviceLock);
  return do_AddRef(GetDXGIAdapterLocked());
}

IDXGIAdapter1* DeviceManagerDx::GetDXGIAdapterLocked() {
  if (mAdapter && mFactory && mFactory->IsCurrent()) {
    return mAdapter;
  }
  mAdapter = nullptr;
  mFactory = nullptr;

  nsModuleHandle dxgiModule(LoadLibrarySystem32(L"dxgi.dll"));
  decltype(CreateDXGIFactory1)* createDXGIFactory1 =
      (decltype(CreateDXGIFactory1)*)GetProcAddress(dxgiModule,
                                                    "CreateDXGIFactory1");
  if (!createDXGIFactory1) {
    return nullptr;
  }
  static const auto fCreateDXGIFactory2 =
      (decltype(CreateDXGIFactory2)*)GetProcAddress(dxgiModule,
                                                    "CreateDXGIFactory2");

  // Try to use a DXGI 1.1 adapter in order to share resources
  // across processes.
  if (StaticPrefs::gfx_direct3d11_enable_debug_layer_AtStartup()) {
    if (fCreateDXGIFactory2) {
      auto hr = fCreateDXGIFactory2(DXGI_CREATE_FACTORY_DEBUG,
                                    __uuidof(IDXGIFactory2),
                                    getter_AddRefs(mFactory));
      MOZ_ALWAYS_TRUE(!FAILED(hr));
    } else {
      NS_WARNING(
          "fCreateDXGIFactory2 not loaded, cannot create debug IDXGIFactory2.");
    }
  }
  if (!mFactory) {
    HRESULT hr =
        createDXGIFactory1(__uuidof(IDXGIFactory1), getter_AddRefs(mFactory));
    if (FAILED(hr) || !mFactory) {
      // This seems to happen with some people running the iZ3D driver.
      // They won't get acceleration.
      return nullptr;
    }
  }

  if (mDeviceStatus) {
    // Match the adapter to our mDeviceStatus, if possible.
    for (UINT index = 0;; index++) {
      RefPtr<IDXGIAdapter1> adapter;
      if (FAILED(mFactory->EnumAdapters1(index, getter_AddRefs(adapter)))) {
        break;
      }

      const DxgiAdapterDesc& preferred = mDeviceStatus->adapter();

      DXGI_ADAPTER_DESC desc;
      if (SUCCEEDED(adapter->GetDesc(&desc)) &&
          desc.AdapterLuid.HighPart == preferred.AdapterLuid.HighPart &&
          desc.AdapterLuid.LowPart == preferred.AdapterLuid.LowPart &&
          desc.VendorId == preferred.VendorId &&
          desc.DeviceId == preferred.DeviceId) {
        mAdapter = adapter.forget();
        break;
      }
    }
  }

  if (!mAdapter) {
    mDeviceStatus.reset();
    // Pick the first adapter available.
    mFactory->EnumAdapters1(0, getter_AddRefs(mAdapter));
  }

  // We leak this module everywhere, we might as well do so here as well.
  dxgiModule.disown();
  return mAdapter;
}

bool DeviceManagerDx::CreateCompositorDeviceHelper(
    FeatureState& aD3d11, IDXGIAdapter1* aAdapter, bool aAttemptVideoSupport,
    RefPtr<ID3D11Device>& aOutDevice) {
  // Check if a failure was injected for testing.
  if (StaticPrefs::gfx_testing_device_fail()) {
    aD3d11.SetFailed(FeatureStatus::Failed,
                     "Direct3D11 device failure simulated by preference",
                     "FEATURE_FAILURE_D3D11_SIM"_ns);
    return false;
  }

  UINT flags = D3D11_CREATE_DEVICE_BGRA_SUPPORT;

  DXGI_ADAPTER_DESC desc;
  aAdapter->GetDesc(&desc);
  if (desc.VendorId != 0x1414) {
    // 0x1414 is Microsoft (e.g. WARP)
    // When not using WARP, use
    // D3D11_CREATE_DEVICE_PREVENT_INTERNAL_THREADING_OPTIMIZATIONS to prevent
    // bug 1092260. IE 11 also uses this flag.
    flags |= D3D11_CREATE_DEVICE_PREVENT_INTERNAL_THREADING_OPTIMIZATIONS;
  }

  if (aAttemptVideoSupport) {
    flags |= D3D11_CREATE_DEVICE_VIDEO_SUPPORT;
  }

  HRESULT hr;
  RefPtr<ID3D11Device> device;
  if (!CreateDevice(aAdapter, D3D_DRIVER_TYPE_UNKNOWN, flags, hr, device)) {
    if (!aAttemptVideoSupport) {
      gfxCriticalError() << "Crash during D3D11 device creation";
      aD3d11.SetFailed(FeatureStatus::CrashedInHandler,
                       "Crashed trying to acquire a D3D11 device",
                       "FEATURE_FAILURE_D3D11_DEVICE1"_ns);
    }
    return false;
  }

  if (FAILED(hr) || !device) {
    if (!aAttemptVideoSupport) {
      aD3d11.SetFailed(FeatureStatus::Failed,
                       "Failed to acquire a D3D11 device",
                       "FEATURE_FAILURE_D3D11_DEVICE2"_ns);
    }
    return false;
  }
  if (!D3D11Checks::DoesDeviceWork()) {
    if (!aAttemptVideoSupport) {
      aD3d11.SetFailed(FeatureStatus::Broken,
                       "Direct3D11 device was determined to be broken",
                       "FEATURE_FAILURE_D3D11_BROKEN"_ns);
    }
    return false;
  }

  aOutDevice = device;
  return true;
}

// Note that it's enough for us to just use a counter for a unique ID,
// even though the counter isn't synchronized between processes. If we
// start in the GPU process and wind up in the parent process, the
// whole graphics stack is blown away anyway. But just in case, we
// make gpu process IDs negative and parent process IDs positive.
static inline int32_t GetNextDeviceCounter() {
  static int32_t sDeviceCounter = 0;
  return XRE_IsGPUProcess() ? --sDeviceCounter : ++sDeviceCounter;
}

void DeviceManagerDx::CreateCompositorDevice(FeatureState& d3d11) {
  if (StaticPrefs::layers_d3d11_force_warp_AtStartup()) {
    CreateWARPCompositorDevice();
    return;
  }

  RefPtr<IDXGIAdapter1> adapter = GetDXGIAdapterLocked();
  if (!adapter) {
    d3d11.SetFailed(FeatureStatus::Unavailable,
                    "Failed to acquire a DXGI adapter",
                    "FEATURE_FAILURE_D3D11_DXGI"_ns);
    return;
  }

  if (XRE_IsGPUProcess() && !D3D11Checks::DoesRemotePresentWork(adapter)) {
    d3d11.SetFailed(FeatureStatus::Unavailable,
                    "DXGI does not support out-of-process presentation",
                    "FEATURE_FAILURE_D3D11_REMOTE_PRESENT"_ns);
    return;
  }

  RefPtr<ID3D11Device> device;
  if (!CreateCompositorDeviceHelper(d3d11, adapter, true, device)) {
    // Try again without video support and record that it failed.
    mCompositorDeviceSupportsVideo = false;
    if (!CreateCompositorDeviceHelper(d3d11, adapter, false, device)) {
      return;
    }
  } else {
    mCompositorDeviceSupportsVideo = true;
  }

  // Only test this when not using WARP since it can fail and cause
  // GetDeviceRemovedReason to return weird values.
  bool textureSharingWorks = D3D11Checks::DoesTextureSharingWork(device);

  DXGI_ADAPTER_DESC desc;
  PodZero(&desc);
  adapter->GetDesc(&desc);

  if (!textureSharingWorks) {
    gfxConfig::SetFailed(Feature::D3D11_HW_ANGLE, FeatureStatus::Broken,
                         "Texture sharing doesn't work",
                         "FEATURE_FAILURE_HW_ANGLE_NEEDS_TEXTURE_SHARING"_ns);
  }
  if (D3D11Checks::DoesRenderTargetViewNeedRecreating(device)) {
    gfxConfig::SetFailed(Feature::D3D11_HW_ANGLE, FeatureStatus::Broken,
                         "RenderTargetViews need recreating",
                         "FEATURE_FAILURE_HW_ANGLE_NEEDS_RTV_RECREATION"_ns);
  }
  if (XRE_IsParentProcess()) {
    // It seems like this may only happen when we're using the NVIDIA gpu
    D3D11Checks::WarnOnAdapterMismatch(device);
  }

  RefPtr<ID3D10Multithread> multi;
  HRESULT hr = device->QueryInterface(__uuidof(ID3D10Multithread),
                                      getter_AddRefs(multi));
  if (SUCCEEDED(hr) && multi) {
    multi->SetMultithreadProtected(TRUE);
  }

  uint32_t featureLevel = device->GetFeatureLevel();
  auto formatOptions = D3D11Checks::FormatOptions(device);
  mCompositorDevice = device;

  int32_t sequenceNumber = GetNextDeviceCounter();
  mDeviceStatus = Some(D3D11DeviceStatus(
      false, textureSharingWorks, featureLevel, DxgiAdapterDesc::From(desc),
      sequenceNumber, formatOptions));
  mCompositorDevice->SetExceptionMode(0);
}

bool DeviceManagerDx::CreateDevice(IDXGIAdapter* aAdapter,
                                   D3D_DRIVER_TYPE aDriverType, UINT aFlags,
                                   HRESULT& aResOut,
                                   RefPtr<ID3D11Device>& aOutDevice) {
  if (StaticPrefs::gfx_direct3d11_enable_debug_layer_AtStartup() ||
      StaticPrefs::gfx_direct3d11_break_on_error_AtStartup()) {
    aFlags |= D3D11_CREATE_DEVICE_DEBUG;
  }

  MOZ_SEH_TRY {
    aResOut = sD3D11CreateDeviceFn(
        aAdapter, aDriverType, nullptr, aFlags, mFeatureLevels.Elements(),
        mFeatureLevels.Length(), D3D11_SDK_VERSION, getter_AddRefs(aOutDevice),
        nullptr, nullptr);
  }
  MOZ_SEH_EXCEPT(EXCEPTION_EXECUTE_HANDLER) { return false; }

  if (StaticPrefs::gfx_direct3d11_break_on_error_AtStartup()) {
    do {
      if (!aOutDevice) break;

      RefPtr<ID3D11Debug> debug;
      if (!SUCCEEDED(aOutDevice->QueryInterface(__uuidof(ID3D11Debug),
                                                getter_AddRefs(debug))))
        break;

      RefPtr<ID3D11InfoQueue> infoQueue;
      if (!SUCCEEDED(debug->QueryInterface(__uuidof(ID3D11InfoQueue),
                                           getter_AddRefs(infoQueue))))
        break;

      D3D11_INFO_QUEUE_FILTER filter;
      PodZero(&filter);

      // Disable warnings caused by Advanced Layers that are known and not
      // problematic.
      D3D11_MESSAGE_ID blockIDs[] = {
          D3D11_MESSAGE_ID_DEVICE_DRAW_CONSTANT_BUFFER_TOO_SMALL};
      filter.DenyList.NumIDs = std::size(blockIDs);
      filter.DenyList.pIDList = blockIDs;
      infoQueue->PushStorageFilter(&filter);

      infoQueue->SetBreakOnSeverity(D3D11_MESSAGE_SEVERITY_CORRUPTION, true);
      infoQueue->SetBreakOnSeverity(D3D11_MESSAGE_SEVERITY_ERROR, true);
      infoQueue->SetBreakOnSeverity(D3D11_MESSAGE_SEVERITY_WARNING, true);
    } while (false);
  }

  return true;
}

void DeviceManagerDx::CreateWARPCompositorDevice() {
  ScopedGfxFeatureReporter reporterWARP(
      "D3D11-WARP", StaticPrefs::layers_d3d11_force_warp_AtStartup());
  FeatureState& d3d11 = gfxConfig::GetFeature(Feature::D3D11_COMPOSITING);

  HRESULT hr;
  RefPtr<ID3D11Device> device;

  // Use D3D11_CREATE_DEVICE_PREVENT_INTERNAL_THREADING_OPTIMIZATIONS
  // to prevent bug 1092260. IE 11 also uses this flag.
  UINT flags = D3D11_CREATE_DEVICE_BGRA_SUPPORT;
  if (!CreateDevice(nullptr, D3D_DRIVER_TYPE_WARP, flags, hr, device)) {
    gfxCriticalError() << "Exception occurred initializing WARP D3D11 device!";
    d3d11.SetFailed(FeatureStatus::CrashedInHandler,
                    "Crashed creating a D3D11 WARP device",
                    "FEATURE_FAILURE_D3D11_WARP_DEVICE"_ns);
  }

  if (FAILED(hr) || !device) {
    // This should always succeed... in theory.
    gfxCriticalError() << "Failed to initialize WARP D3D11 device! "
                       << hexa(hr);
    d3d11.SetFailed(FeatureStatus::Failed,
                    "Failed to create a D3D11 WARP device",
                    "FEATURE_FAILURE_D3D11_WARP_DEVICE2"_ns);
    return;
  }

  bool textureSharingWorks = D3D11Checks::DoesTextureSharingWork(device);

  RefPtr<ID3D10Multithread> multi;
  hr = device->QueryInterface(__uuidof(ID3D10Multithread),
                              getter_AddRefs(multi));
  if (SUCCEEDED(hr) && multi) {
    multi->SetMultithreadProtected(TRUE);
  }

  DXGI_ADAPTER_DESC desc;
  D3D11Checks::GetDxgiDesc(device, &desc);

  int featureLevel = device->GetFeatureLevel();

  auto formatOptions = D3D11Checks::FormatOptions(device);
  mCompositorDevice = device;

  int32_t sequenceNumber = GetNextDeviceCounter();
  mDeviceStatus = Some(D3D11DeviceStatus(
      true, textureSharingWorks, featureLevel, DxgiAdapterDesc::From(desc),
      sequenceNumber, formatOptions));
  mCompositorDevice->SetExceptionMode(0);

  reporterWARP.SetSuccessful();
}

FeatureStatus DeviceManagerDx::CreateContentDevice() {
  RefPtr<IDXGIAdapter1> adapter;
  if (!IsWARPLocked()) {
    adapter = GetDXGIAdapterLocked();
    if (!adapter) {
      gfxCriticalNote << "Could not get a DXGI adapter";
      return FeatureStatus::Unavailable;
    }
  }

  HRESULT hr;
  RefPtr<ID3D11Device> device;

  UINT flags = D3D11_CREATE_DEVICE_BGRA_SUPPORT;
  D3D_DRIVER_TYPE type =
      IsWARPLocked() ? D3D_DRIVER_TYPE_WARP : D3D_DRIVER_TYPE_UNKNOWN;
  if (!CreateDevice(adapter, type, flags, hr, device)) {
    gfxCriticalNote
        << "Recovered from crash while creating a D3D11 content device";
    gfxWindowsPlatform::RecordContentDeviceFailure(
        TelemetryDeviceCode::Content);
    return FeatureStatus::CrashedInHandler;
  }

  if (FAILED(hr) || !device) {
    gfxCriticalNote << "Failed to create a D3D11 content device: " << hexa(hr);
    gfxWindowsPlatform::RecordContentDeviceFailure(
        TelemetryDeviceCode::Content);
    return FeatureStatus::Failed;
  }

  // InitializeD2D() will abort early if the compositor device did not support
  // texture sharing. If we're in the content process, we can't rely on the
  // parent device alone: some systems have dual GPUs that are capable of
  // binding the parent and child processes to different GPUs. As a safety net,
  // we re-check texture sharing against the newly created D3D11 content device.
  // If it fails, we won't use Direct2D.
  if (XRE_IsContentProcess()) {
    if (!D3D11Checks::DoesTextureSharingWork(device)) {
      return FeatureStatus::Failed;
    }

    DebugOnly<bool> ok = ContentAdapterIsParentAdapter(device);
    MOZ_ASSERT(ok);
  }

  mContentDevice = device;
  mContentDevice->SetExceptionMode(0);

  RefPtr<ID3D10Multithread> multi;
  hr = mContentDevice->QueryInterface(__uuidof(ID3D10Multithread),
                                      getter_AddRefs(multi));
  if (SUCCEEDED(hr) && multi) {
    multi->SetMultithreadProtected(TRUE);
  }
  return FeatureStatus::Available;
}

RefPtr<ID3D11Device> DeviceManagerDx::CreateDecoderDevice(
    DeviceFlagSet aFlags) {
  MutexAutoLock lock(mDeviceLock);

  if (!mDeviceStatus) {
    return nullptr;
  }

  bool isAMD = mDeviceStatus->adapter().VendorId == 0x1002;
  bool reuseDevice = false;
  if (gfxVars::ReuseDecoderDevice()) {
    reuseDevice = true;
  } else if (isAMD) {
    reuseDevice = true;
    gfxCriticalNoteOnce << "Always have to reuse decoder device on AMD";
  }

  if (reuseDevice) {
    // Use mCompositorDevice for decoder device only for hardware WebRender.
    if (aFlags.contains(DeviceFlag::isHardwareWebRenderInUse) &&
        mCompositorDevice && mCompositorDeviceSupportsVideo &&
        !mDecoderDevice) {
      mDecoderDevice = mCompositorDevice;

      RefPtr<ID3D10Multithread> multi;
      mDecoderDevice->QueryInterface(__uuidof(ID3D10Multithread),
                                     getter_AddRefs(multi));
      if (multi) {
        MOZ_ASSERT(multi->GetMultithreadProtected());
      }
    }

    if (mDecoderDevice) {
      RefPtr<ID3D11Device> dev = mDecoderDevice;
      return dev.forget();
    }
  }

  if (!sD3D11CreateDeviceFn) {
    // We should just be on Windows Vista or XP in this case.
    return nullptr;
  }

  RefPtr<IDXGIAdapter1> adapter = GetDXGIAdapterLocked();
  if (!adapter) {
    return nullptr;
  }

  HRESULT hr;
  RefPtr<ID3D11Device> device;

  UINT flags = D3D11_CREATE_DEVICE_PREVENT_INTERNAL_THREADING_OPTIMIZATIONS |
               D3D11_CREATE_DEVICE_VIDEO_SUPPORT;
  if (!CreateDevice(adapter, D3D_DRIVER_TYPE_UNKNOWN, flags, hr, device)) {
    return nullptr;
  }
  if (FAILED(hr) || !device || !D3D11Checks::DoesDeviceWork()) {
    return nullptr;
  }

  RefPtr<ID3D10Multithread> multi;
  device->QueryInterface(__uuidof(ID3D10Multithread), getter_AddRefs(multi));
  if (multi) {
    multi->SetMultithreadProtected(TRUE);
  }
  if (reuseDevice) {
    mDecoderDevice = device;
  }
  return device;
}

// ID3D11DeviceChild, IDXGIObject and ID3D11Device implement SetPrivateData with
// the exact same parameters.
template <typename T>
static HRESULT SetDebugName(T* d3d11Object, const char* debugString) {
  return d3d11Object->SetPrivateData(WKPDID_D3DDebugObjectName,
                                     strlen(debugString), debugString);
}

RefPtr<ID3D11Device> DeviceManagerDx::CreateMediaEngineDevice() {
  MutexAutoLock lock(mDeviceLock);
  if (!LoadD3D11()) {
    return nullptr;
  }

  HRESULT hr;
  RefPtr<ID3D11Device> device;
  UINT flags = D3D11_CREATE_DEVICE_VIDEO_SUPPORT |
               D3D11_CREATE_DEVICE_BGRA_SUPPORT |
               D3D11_CREATE_DEVICE_PREVENT_INTERNAL_THREADING_OPTIMIZATIONS;
  if (!CreateDevice(nullptr, D3D_DRIVER_TYPE_HARDWARE, flags, hr, device)) {
    return nullptr;
  }
  if (FAILED(hr) || !device || !D3D11Checks::DoesDeviceWork()) {
    return nullptr;
  }
  Unused << SetDebugName(device.get(), "MFMediaEngineDevice");

  RefPtr<ID3D10Multithread> multi;
  device->QueryInterface(__uuidof(ID3D10Multithread), getter_AddRefs(multi));
  if (multi) {
    multi->SetMultithreadProtected(TRUE);
  }
  return device;
}

void DeviceManagerDx::ResetDevices() {
  MutexAutoLock lock(mDeviceLock);
  ResetDevicesLocked();
}

void DeviceManagerDx::ResetDevicesLocked() {
  mAdapter = nullptr;
  mCompositorAttachments = nullptr;
  mCompositorDevice = nullptr;
  mContentDevice = nullptr;
  mCanvasDevice = nullptr;
  mImageDevice = nullptr;
  mVRDevice = nullptr;
  mDecoderDevice = nullptr;
  mDirectCompositionDevice = nullptr;
  mDeviceStatus = Nothing();
  mDeviceResetReason = Nothing();
  Factory::SetDirect3D11Device(nullptr);
}

bool DeviceManagerDx::MaybeResetAndReacquireDevices() {
  MutexAutoLock lock(mDeviceLock);

  DeviceResetReason resetReason;
  if (!HasDeviceResetLocked(&resetReason)) {
    return false;
  }

  GPUProcessManager::RecordDeviceReset(resetReason);

  bool createCompositorDevice = !!mCompositorDevice;
  bool createContentDevice = !!mContentDevice;
  bool createCanvasDevice = !!mCanvasDevice;
  bool createDirectCompositionDevice = !!mDirectCompositionDevice;

  ResetDevicesLocked();

  if (createCompositorDevice && !CreateCompositorDevicesLocked()) {
    // Just stop, don't try anything more
    return true;
  }
  if (createContentDevice) {
    CreateContentDevicesLocked();
  }
  if (createCanvasDevice) {
    CreateCanvasDeviceLocked();
  }
  if (createDirectCompositionDevice) {
    CreateDirectCompositionDeviceLocked();
  }

  return true;
}

bool DeviceManagerDx::ContentAdapterIsParentAdapter(ID3D11Device* device) {
  DXGI_ADAPTER_DESC desc;
  if (!D3D11Checks::GetDxgiDesc(device, &desc)) {
    gfxCriticalNote << "Could not query device DXGI adapter info";
    return false;
  }

  if (!mDeviceStatus) {
    return false;
  }

  const DxgiAdapterDesc& preferred = mDeviceStatus->adapter();

  if (desc.VendorId != preferred.VendorId ||
      desc.DeviceId != preferred.DeviceId ||
      desc.SubSysId != preferred.SubSysId ||
      desc.AdapterLuid.HighPart != preferred.AdapterLuid.HighPart ||
      desc.AdapterLuid.LowPart != preferred.AdapterLuid.LowPart) {
    gfxCriticalNote << "VendorIDMismatch P " << hexa(preferred.VendorId) << " "
                    << hexa(desc.VendorId);
    return false;
  }

  return true;
}

static DeviceResetReason HResultToResetReason(HRESULT hr) {
  switch (hr) {
    case DXGI_ERROR_DEVICE_HUNG:
      return DeviceResetReason::HUNG;
    case DXGI_ERROR_DEVICE_REMOVED:
      return DeviceResetReason::REMOVED;
    case DXGI_ERROR_DEVICE_RESET:
      return DeviceResetReason::RESET;
    case DXGI_ERROR_DRIVER_INTERNAL_ERROR:
      return DeviceResetReason::DRIVER_ERROR;
    case DXGI_ERROR_INVALID_CALL:
      return DeviceResetReason::INVALID_CALL;
    case E_OUTOFMEMORY:
      return DeviceResetReason::OUT_OF_MEMORY;
    default:
      MOZ_ASSERT(false);
  }
  return DeviceResetReason::OTHER;
}

bool DeviceManagerDx::HasDeviceReset(DeviceResetReason* aOutReason) {
  MutexAutoLock lock(mDeviceLock);
  return HasDeviceResetLocked(aOutReason);
}

bool DeviceManagerDx::HasDeviceResetLocked(DeviceResetReason* aOutReason) {
  if (mDeviceResetReason) {
    if (aOutReason) {
      *aOutReason = mDeviceResetReason.value();
    }
    return true;
  }

  DeviceResetReason reason;
  if (GetAnyDeviceRemovedReason(&reason)) {
    mDeviceResetReason = Some(reason);
    if (aOutReason) {
      *aOutReason = reason;
    }
    return true;
  }

  return false;
}

static inline bool DidDeviceReset(const RefPtr<ID3D11Device>& aDevice,
                                  DeviceResetReason* aOutReason) {
  if (!aDevice) {
    return false;
  }
  HRESULT hr = aDevice->GetDeviceRemovedReason();
  if (hr == S_OK) {
    return false;
  }

  *aOutReason = HResultToResetReason(hr);
  return true;
}

bool DeviceManagerDx::GetAnyDeviceRemovedReason(DeviceResetReason* aOutReason) {
  if (DidDeviceReset(mCompositorDevice, aOutReason) ||
      DidDeviceReset(mContentDevice, aOutReason) ||
      DidDeviceReset(mCanvasDevice, aOutReason)) {
    return true;
  }

  if (XRE_IsParentProcess() && NS_IsMainThread() &&
      StaticPrefs::gfx_testing_device_reset()) {
    Preferences::SetInt("gfx.testing.device-reset", 0);
    *aOutReason = DeviceResetReason::FORCED_RESET;
    return true;
  }

  return false;
}

void DeviceManagerDx::ForceDeviceReset(ForcedDeviceResetReason aReason) {
  glean::gfx::forced_device_reset_reason.AccumulateSingleSample(
      uint32_t(aReason));
  {
    MutexAutoLock lock(mDeviceLock);
    if (!mDeviceResetReason) {
      mDeviceResetReason = Some(DeviceResetReason::FORCED_RESET);
    }
  }
}

void DeviceManagerDx::DisableD3D11AfterCrash() {
  gfxConfig::Disable(Feature::D3D11_COMPOSITING,
                     FeatureStatus::CrashedInHandler,
                     "Crashed while acquiring a Direct3D11 device",
                     "FEATURE_FAILURE_D3D11_CRASH"_ns);
  ResetDevices();
}

RefPtr<ID3D11Device> DeviceManagerDx::GetCompositorDevice() {
  /// ID3D11Device is thread-safe. We need the lock to read the
  /// mDeviceLockPointer, but manipulating the pointee outside of the lock is
  /// safe. See
  /// https://learn.microsoft.com/en-us/windows/win32/direct3d11/overviews-direct3d-11-render-multi-thread-intro
  MutexAutoLock lock(mDeviceLock);
  return mCompositorDevice;
}

RefPtr<ID3D11Device> DeviceManagerDx::GetContentDevice() {
  MOZ_ASSERT(XRE_IsGPUProcess() ||
             gfxPlatform::GetPlatform()->DevicesInitialized());

  MutexAutoLock lock(mDeviceLock);
  return mContentDevice;
}

RefPtr<ID3D11Device> DeviceManagerDx::GetImageDevice() {
  MutexAutoLock lock(mDeviceLock);
  if (mImageDevice) {
    return mImageDevice;
  }

  RefPtr<ID3D11Device> device = mContentDevice;
  if (!device) {
    device = mCompositorDevice;
  }

  if (!device) {
    return nullptr;
  }

  RefPtr<ID3D10Multithread> multi;
  HRESULT hr =
      device->QueryInterface((ID3D10Multithread**)getter_AddRefs(multi));
  if (FAILED(hr) || !multi) {
    gfxWarning() << "Multithread safety interface not supported. " << hr;
    return nullptr;
  } else {
    MOZ_ASSERT(multi->GetMultithreadProtected());
  }

  mImageDevice = device;

  return mImageDevice;
}

RefPtr<ID3D11Device> DeviceManagerDx::GetVRDevice() {
  MutexAutoLock lock(mDeviceLock);
  if (!mVRDevice) {
    CreateVRDevice();
  }
  return mVRDevice;
}

RefPtr<ID3D11Device> DeviceManagerDx::GetCanvasDevice() {
  MutexAutoLock lock(mDeviceLock);
  return mCanvasDevice;
}

RefPtr<IDCompositionDevice2> DeviceManagerDx::GetDirectCompositionDevice() {
  MutexAutoLock lock(mDeviceLock);
  return mDirectCompositionDevice;
}

unsigned DeviceManagerDx::GetCompositorFeatureLevel() const {
  MutexAutoLock lock(mDeviceLock);
  if (!mDeviceStatus) {
    return 0;
  }
  return mDeviceStatus->featureLevel();
}

bool DeviceManagerDx::TextureSharingWorks() {
  MutexAutoLock lock(mDeviceLock);
  if (!mDeviceStatus) {
    return false;
  }
  return mDeviceStatus->textureSharingWorks();
}

bool DeviceManagerDx::CanInitializeKeyedMutexTextures() {
  MutexAutoLock lock(mDeviceLock);
  return mDeviceStatus && StaticPrefs::gfx_direct3d11_allow_keyed_mutex() &&
         gfxVars::AllowD3D11KeyedMutex();
}

bool DeviceManagerDx::IsWARP() {
  MutexAutoLock lock(mDeviceLock);
  return IsWARPLocked();
}

bool DeviceManagerDx::IsWARPLocked() {
  if (!mDeviceStatus) {
    return false;
  }
  return mDeviceStatus->isWARP();
}

bool DeviceManagerDx::CanUseNV12() {
  MutexAutoLock lock(mDeviceLock);
  if (!mDeviceStatus) {
    return false;
  }
  return mDeviceStatus->formatOptions().contains(
      D3D11Checks::VideoFormatOption::NV12);
}

bool DeviceManagerDx::CanUseP010() {
  MutexAutoLock lock(mDeviceLock);
  if (!mDeviceStatus) {
    return false;
  }
  return mDeviceStatus->formatOptions().contains(
      D3D11Checks::VideoFormatOption::P010);
}

bool DeviceManagerDx::CanUseP016() {
  MutexAutoLock lock(mDeviceLock);
  if (!mDeviceStatus) {
    return false;
  }
  return mDeviceStatus->formatOptions().contains(
      D3D11Checks::VideoFormatOption::P016);
}

bool DeviceManagerDx::CanUseDComp() {
  MutexAutoLock lock(mDeviceLock);
  return !!mDirectCompositionDevice;
}

void DeviceManagerDx::GetCompositorDevices(
    RefPtr<ID3D11Device>* aOutDevice,
    RefPtr<layers::DeviceAttachmentsD3D11>* aOutAttachments) {
  RefPtr<ID3D11Device> device;
  {
    MutexAutoLock lock(mDeviceLock);
    if (!mCompositorDevice) {
      return;
    }
    if (mCompositorAttachments) {
      *aOutDevice = mCompositorDevice;
      *aOutAttachments = mCompositorAttachments;
      return;
    }

    // Otherwise, we'll try to create attachments outside the lock.
    device = mCompositorDevice;
  }

  // We save the attachments object even if it fails to initialize, so the
  // compositor can grab the failure ID.
  RefPtr<layers::DeviceAttachmentsD3D11> attachments =
      layers::DeviceAttachmentsD3D11::Create(device);
  {
    MutexAutoLock lock(mDeviceLock);
    if (device != mCompositorDevice) {
      return;
    }
    mCompositorAttachments = attachments;
  }

  *aOutDevice = device;
  *aOutAttachments = attachments;
}

/* static */
void DeviceManagerDx::PreloadAttachmentsOnCompositorThread() {
  if (!CompositorThread()) {
    return;
  }

  RefPtr<Runnable> task = NS_NewRunnableFunction(
      "DeviceManagerDx::PreloadAttachmentsOnCompositorThread", []() -> void {
        if (DeviceManagerDx* dm = DeviceManagerDx::Get()) {
          RefPtr<ID3D11Device> device;
          RefPtr<layers::DeviceAttachmentsD3D11> attachments;
          dm->GetCompositorDevices(&device, &attachments);
        }
      });
  CompositorThread()->Dispatch(task.forget());
}

}  // namespace gfx
}  // namespace mozilla
