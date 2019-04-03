/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "nsWinPWASupport.h"
#include "mozilla/dom/Promise.h"
#include "PWASupportUtils.h"
#include "nsIWinTaskbar.h"
#include "nsNetUtil.h"
#include "nsIFileURL.h"
#include "nsIFile.h"
#include "nsMimeTypes.h"
#include "imgLoader.h"
#include "gfxUtils.h"
#include "imgIContainer.h"
#include "mozilla/image/nsICOEncoder.h"
#include "mozilla/gfx/2D.h"
#include "mozilla/gfx/DataSurfaceHelpers.h"
#include "ImageOps.h"
#include "nsIAsyncStreamCopier2.h"
#include "nsIOutputStream.h"
#include "nsIWidget.h"
#include "nsGlobalWindowOuter.h"
#include "nsDirectoryServiceDefs.h"
#include "nsAppDirectoryServiceDefs.h"
#include "mozilla/ErrorNames.h"
#include "nsIBrowserDOMWindow.h"
#include "nsIDOMChromeWindow.h"

#include <windows.h>
#include <shobjidl.h>
#include <shellapi.h>
#include <propvarutil.h>
#include <propkey.h>

using mozilla::ErrorResult;
using mozilla::dom::Promise;
using namespace mozilla::gfx;
using mozilla::image::ImageOps;

#define ICON_FILE NS_LITERAL_STRING("icon.ico")

#ifdef DEBUG
#define NS_ENSURE_HRESULT(hres, ret)                     \
  do {                                                   \
    HRESULT result = hres;                               \
    if (MOZ_UNLIKELY(FAILED(result))) {                  \
      mozilla::SmprintfPointer msg = mozilla::Smprintf(  \
          "NS_ENSURE_HRESULT(%s, %s) failed with "       \
          "result 0x%" PRIX32,                           \
          #hres, #ret, static_cast<uint32_t>(result));   \
      NS_WARNING(msg.get());                             \
      return ret;                                        \
    }                                                    \
  } while (false)
#else
#define NS_ENSURE_HRESULT(hres, ret) if (MOZ_UNLIKELY(FAILED(hres))) return ret
#endif

nsresult SetProp(IPropertyStore* store, const PROPERTYKEY key, nsAString& value) {
  PROPVARIANT pv;
  if (FAILED(InitPropVariantFromString(PromiseFlatString(value).get(), &pv))) {
    return NS_ERROR_FAILURE;
  }

  HRESULT hr = store->SetValue(key, pv);
  PropVariantClear(&pv);

  if (HRESULT_CODE(hr) == ERROR_INSUFFICIENT_BUFFER) {
    return NS_OK;
  }

  return FAILED(hr) ? NS_ERROR_FAILURE : NS_OK;
}

nsresult GetGroupId(nsIPWA* pwa, nsAString& id) {
  nsresult rv;
  nsCOMPtr<nsIWinTaskbar> taskbar = do_GetService("@mozilla.org/windows-taskbar;1", &rv);
  NS_ENSURE_SUCCESS(rv, rv);

  nsCString pwaId;
  rv = pwa->GetId(pwaId);
  NS_ENSURE_SUCCESS(rv, rv);

  rv = taskbar->GetDefaultGroupId(id);
  if (NS_FAILED(rv)) {
    id.AssignLiteral("Firefox");
  }

  id.AppendLiteral(".pwa.");
  id.Append(NS_ConvertUTF8toUTF16(pwaId));

  return NS_OK;
}

nsresult GetLaunchArgs(nsIPWA* pwa, nsAString& args) {
  nsCString pwaId;
  nsresult rv = pwa->GetId(pwaId);
  NS_ENSURE_SUCCESS(rv, rv);

  nsCOMPtr<nsIFile> profDFile;
  rv = NS_GetSpecialDirectory(NS_APP_USER_PROFILE_50_DIR, getter_AddRefs(profDFile));
  NS_ENSURE_SUCCESS(rv, rv);

  nsString profD(profDFile->NativePath());

  nsCOMPtr<nsIFile> profLDFile;
  rv = NS_GetSpecialDirectory(NS_APP_USER_PROFILE_LOCAL_50_DIR, getter_AddRefs(profLDFile));
  NS_ENSURE_SUCCESS(rv, rv);

  nsString profLD(profLDFile->NativePath());

  args.AppendPrintf("\"-pwa\" \"%s\" \"-profile\" \"%S\" \"-localprofile\" \"%S\"", pwaId.get(), profD.get(), profLD.get());

  return NS_OK;
}

NS_IMPL_ISUPPORTS(PWAInstaller, nsIRunnable, nsIRequestObserver);

PWAInstaller::PWAInstaller(nsIPWA* pwa, nsIFile* dir, Promise* promise) :
  mPwa(pwa),
  mDir(dir),
  mPromise(new nsMainThreadPtrHolder<Promise>("promise release", promise)) {
}

nsresult
PWAInstaller::Resolve() {
  if (NS_IsMainThread()) {
    mPromise->MaybeResolveWithUndefined();
    return NS_OK;
  }

  nsMainThreadPtrHandle<mozilla::dom::Promise> promise = mPromise;
  return NS_DispatchToMainThread(NS_NewRunnableFunction(
      "ico builder resolve",
      [&]() {
        promise->MaybeResolveWithUndefined();
      }));
}

nsresult
PWAInstaller::Reject(nsresult rv) {
  if (NS_IsMainThread()) {
    mPromise->MaybeReject(rv);
    return NS_OK;
  }

  nsMainThreadPtrHandle<mozilla::dom::Promise> promise = mPromise;
  return NS_DispatchToMainThread(NS_NewRunnableFunction(
      "ico builder reject",
      [&]() {
        promise->MaybeReject(rv);
      }));
}

nsresult
PWAInstaller::BuildShortcut() {
  nsresult rv;
  RefPtr<IShellLinkW> link;
  HRESULT hresult = CoCreateInstance(CLSID_ShellLink, nullptr, CLSCTX_INPROC_SERVER,
                                    IID_IShellLinkW, getter_AddRefs(link));
  NS_ENSURE_HRESULT(hresult, NS_ERROR_FAILURE);

  nsCOMPtr<nsIFile> exeFile;
  rv = NS_GetSpecialDirectory(XRE_EXECUTABLE_FILE, getter_AddRefs(exeFile));
  NS_ENSURE_SUCCESS(rv, rv);

  nsString path(exeFile->NativePath());
  link->SetPath(path.get());

  nsString args;
  rv = GetLaunchArgs(mPwa, args);
  NS_ENSURE_SUCCESS(rv, rv);
  link->SetArguments(args.get());

  nsCString name;
  rv = mPwa->GetName(name);
  NS_ENSURE_SUCCESS(rv, rv);
  link->SetDescription(NS_ConvertUTF8toUTF16(name).get());

  nsCOMPtr<nsIFile> iconFile;
  rv = mDir->Clone(getter_AddRefs(iconFile));
  NS_ENSURE_SUCCESS(rv, rv);

  rv = iconFile->Append(ICON_FILE);
  NS_ENSURE_SUCCESS(rv, rv);

  nsString icon(iconFile->NativePath());
  link->SetIconLocation(icon.get(), 0);

  RefPtr<IPropertyStore> propStore;
  hresult = link->QueryInterface(IID_IPropertyStore, getter_AddRefs(propStore));
  NS_ENSURE_HRESULT(hresult, NS_ERROR_FAILURE);

  nsString groupId;
  rv = GetGroupId(mPwa, groupId);
  NS_ENSURE_SUCCESS(rv, rv);

  rv = SetProp(propStore, PKEY_AppUserModel_ID, groupId);
  NS_ENSURE_SUCCESS(rv, rv);

  hresult = propStore->Commit();
  NS_ENSURE_HRESULT(hresult, NS_ERROR_FAILURE);

  RefPtr<IPersistFile> persist;
  hresult = link->QueryInterface(IID_IPersistFile, getter_AddRefs(persist));
  NS_ENSURE_HRESULT(hresult, NS_ERROR_FAILURE);

  nsCOMPtr<nsIFile> targetFile;
  rv = NS_GetSpecialDirectory(NS_WIN_HOME_DIR, getter_AddRefs(targetFile));
  NS_ENSURE_SUCCESS(rv, rv);

  rv = targetFile->Append(NS_LITERAL_STRING("Desktop"));
  NS_ENSURE_SUCCESS(rv, rv);

  name.AppendLiteral(".lnk");
  rv = targetFile->Append(NS_ConvertUTF8toUTF16(name));
  NS_ENSURE_SUCCESS(rv, rv);

  nsString target(targetFile->NativePath());
  hresult = persist->Save(target.get(), true);
  NS_ENSURE_HRESULT(hresult, NS_ERROR_FAILURE);

  return NS_OK;
}

nsresult
PWAInstaller::CollectIcons() {
  nsCOMPtr<nsIArray> array;
  nsresult rv = mPwa->GetIcons(getter_AddRefs(array));
  NS_ENSURE_SUCCESS(rv, rv);

  uint32_t length;
  rv = array->GetLength(&length);
  NS_ENSURE_SUCCESS(rv, rv);

  for (uint32_t i = 0; i < length; i++) {
    nsCOMPtr<nsIPWAIcon> icon;
    rv = array->QueryElementAt(i, NS_GET_IID(nsIPWAIcon), getter_AddRefs(icon));
    if (NS_FAILED(rv)) {
      continue;
    }

    nsCString type;
    rv = icon->GetType(type);
    if (NS_FAILED(rv)) {
      continue;
    }

    if (!imgLoader::SupportImageWithMimeType(type.get(), AcceptedMimeTypes::IMAGES)) {
      continue;
    }

    nsCString src;
    rv = icon->GetSrc(src);
    if (NS_FAILED(rv)) {
      continue;
    }

    nsCOMPtr<nsIURI> uri;
    rv = NS_NewURI(getter_AddRefs(uri), src);
    if (NS_FAILED(rv)) {
      continue;
    }

    nsCOMPtr<nsIFileURL> fileUrl = do_QueryInterface(uri, &rv);
    if (NS_FAILED(rv)) {
      continue;
    }

    nsCOMPtr<nsIFile> file;
    rv = fileUrl->GetFile(getter_AddRefs(file));
    if (NS_FAILED(rv)) {
      continue;
    }

    mIconFiles.AppendElement(file);
    mIconTypes.AppendElement(type);
  }

  return NS_OK;
}

// This is called on a background thread.
nsresult
PWAInstaller::BuildIco() {
  nsresult rv;
  RefPtr<imgIEncoder> encoder = mozilla::MakeRefPtr<nsICOEncoder>();
  rv = encoder->StartImageEncode(0, 0, imgIEncoder::INPUT_FORMAT_HOSTARGB,
                                 NS_LITERAL_STRING(""));
  NS_ENSURE_SUCCESS(rv, rv);

  for (uint32_t i = 0; i < 1; i++) {
    nsCOMPtr<nsIInputStream> stream;
    rv = NS_NewLocalFileInputStream(getter_AddRefs(stream), mIconFiles[i]);
    if (NS_FAILED(rv)) {
      continue;
    }

    nsCOMPtr<nsIInputStream> bufStream;
    rv = NS_NewBufferedInputStream(getter_AddRefs(bufStream), stream.forget(), 1024);

    RefPtr<SourceSurface> surface = ImageOps::DecodeToSurface(bufStream.forget(),
        mIconTypes[i], imgIContainer::DECODE_FLAGS_DEFAULT);
    if (!surface) {
      continue;
    }

    const IntSize size = surface->GetSize();
    if (size.IsEmpty()) {
      return NS_ERROR_INVALID_ARG;
    }

    RefPtr<gfxUtils::DataSourceSurface> dataSurface;
    if (surface->GetFormat() != SurfaceFormat::B8G8R8A8) {
      dataSurface = gfxUtils::CopySurfaceToDataSourceSurfaceWithFormat(
          surface, SurfaceFormat::B8G8R8A8);
    } else {
      dataSurface = surface->GetDataSurface();
    }
    if (!dataSurface) {
      continue;
    }

    if (size.width != 256 && size.height != 256) {
      RefPtr<DataSourceSurface> targetDataSurface =
          Factory::CreateDataSourceSurface(IntSize(256, 258),
                                           SurfaceFormat::B8G8R8A8, true);
      if (!targetDataSurface) {
        continue;
      }

      DataSourceSurface::MappedSurface map;
      if (!targetDataSurface->Map(DataSourceSurface::MapType::WRITE, &map)) {
        continue;
      }

      RefPtr<DrawTarget> dt = Factory::CreateDrawTargetForData(
          BackendType::CAIRO, map.mData, targetDataSurface->GetSize(),
          map.mStride, SurfaceFormat::B8G8R8A8);
      NS_ENSURE_STATE(dt);

      dt->DrawSurface(dataSurface, Rect(0, 0, 256, 256),
                      Rect(0, 0, size.width, size.height),
                      DrawSurfaceOptions(),
                      DrawOptions(1.0f, CompositionOp::OP_SOURCE));
      targetDataSurface->Unmap();
      dataSurface = targetDataSurface;
    }

    gfxUtils::DataSourceSurface::MappedSurface map;
    if (!dataSurface->Map(DataSourceSurface::MapType::READ, &map)) {
      continue;
    }

    rv = encoder->AddImageFrame(map.mData,
        BufferSizeFromStrideAndHeight(map.mStride, size.height),
        256, 256, map.mStride,
        imgIEncoder::INPUT_FORMAT_HOSTARGB, NS_LITERAL_STRING(""));

    dataSurface->Unmap();
  }

  rv = encoder->EndImageEncode();
  NS_ENSURE_SUCCESS(rv, rv);

  nsCOMPtr<nsIFile> outputFile;
  rv = mDir->Clone(getter_AddRefs(outputFile));
  NS_ENSURE_SUCCESS(rv, rv);

  rv = outputFile->Append(ICON_FILE);
  NS_ENSURE_SUCCESS(rv, rv);

  nsCOMPtr<nsIOutputStream> stream;
  rv = NS_NewLocalFileOutputStream(getter_AddRefs(stream), outputFile);
  NS_ENSURE_SUCCESS(rv, rv);

  nsCOMPtr<nsIAsyncStreamCopier2> copier =
      do_CreateInstance(NS_ASYNCSTREAMCOPIER_CONTRACTID, &rv);
  NS_ENSURE_SUCCESS(rv, rv);

  rv = copier->Init(encoder, stream, nullptr, 0, true, true);
  NS_ENSURE_SUCCESS(rv, rv);

  // We have to start async copies from the main thread :(
  // We use sync dispatch to ensure this object gets add-refed before this
  // function ends and the calling thread drops its reference to this.
  RefPtr<PWAInstaller> installer = this;
  rv = NS_DispatchToMainThread(NS_NewRunnableFunction(
      "ico builder async copy",
      [&]() {
        nsresult rv = copier->AsyncCopy(installer, nullptr);
        if (NS_FAILED(rv)) {
          Reject(rv);
        }
      }), nsIEventTarget::DISPATCH_SYNC);
  NS_ENSURE_SUCCESS(rv, rv);

  return NS_OK;
}

nsresult
PWAInstaller::Install() {
  // Listing icons calls into JS so must run on the main thread.
  nsresult rv = CollectIcons();
  NS_ENSURE_SUCCESS(rv, rv);

  if (mIconFiles.Length() == 0) {
    return Resolve();
  }

  nsCOMPtr<nsIThread> thread;
  rv = NS_NewNamedThread("ico builder", getter_AddRefs(thread), this);
  NS_ENSURE_SUCCESS(rv, rv);

  // Failing here is I guess ignorable?
  thread->AsyncShutdown();

  return NS_OK;
}

NS_IMETHODIMP
PWAInstaller::OnStartRequest(nsIRequest* request) {
  return NS_OK;
}

NS_IMETHODIMP
PWAInstaller::OnStopRequest(nsIRequest* request, nsresult status) {
  if (NS_FAILED(status)) {
    return Reject(status);
  }

  nsresult rv = BuildShortcut();
  if (NS_FAILED(rv)) {
    return Reject(rv);
  }

  return Resolve();
}

NS_IMETHODIMP
PWAInstaller::Run() {
  nsresult rv = BuildIco();
  if (NS_FAILED(rv)) {
    Reject(rv);
  }
  return NS_OK;
}

NS_IMPL_ISUPPORTS(nsWinPWASupport, nsINativePWASupport)

RefPtr<nsWinPWASupport> nsWinPWASupport::gSingleton = nullptr;

already_AddRefed<nsWinPWASupport> nsWinPWASupport::GetSingleton() {
  if (!nsWinPWASupport::gSingleton) {
    nsWinPWASupport::gSingleton = new nsWinPWASupport();
  }

  return do_AddRef(nsWinPWASupport::gSingleton);
}

NS_IMETHODIMP
nsWinPWASupport::Install(nsIPWA* pwa, nsIFile* dir, JSContext* cx, Promise** result) {
  RefPtr<Promise> promise;
  nsresult rv = MakePromise(cx, getter_AddRefs(promise));
  NS_ENSURE_SUCCESS(rv, rv);
  NS_ADDREF(*result = promise);

  RefPtr<PWAInstaller> installer = new PWAInstaller(pwa, dir, promise);
  rv = installer->Install();
  NS_PROMISE_SUCCESS(rv, promise);

  return NS_OK;
}

NS_IMETHODIMP
nsWinPWASupport::Load(nsIPWA* pwa, nsIFile* dir, nsIPWALoadInfo* loadInfo,
                      JSContext* cx, Promise** result) {
  RefPtr<Promise> promise;
  nsresult rv = MakePromise(cx, getter_AddRefs(promise));
  NS_ENSURE_SUCCESS(rv, rv);
  NS_ADDREF(*result = promise);

  nsCOMPtr<mozIDOMWindowProxy> windowProxy;
  rv = FindWindow(pwa, getter_AddRefs(windowProxy));
  if (NS_SUCCEEDED(rv) && windowProxy) {
    nsCOMPtr<nsPIDOMWindowOuter> window = nsPIDOMWindowOuter::From(windowProxy);

    /*if (loadInfo) {
      nsCOMPtr<nsIDOMChromeWindow> chromeWin = do_QueryInterface(windowProxy);
      if (!chromeWin) {
        NS_PROMISE_SUCCESS(NS_ERROR_UNEXPECTED, promise);
      }

      nsCOMPtr<nsIBrowserDOMWindow> bdw;
      rv = chromeWin->GetBrowserDOMWindow(getter_AddRefs(bdw));
      NS_PROMISE_SUCCESS(rv, promise);

      nsCOMPtr<nsIPWAWindow> pwaWin(do_QueryInterface(bdw));
      if (!pwaWin) {
        NS_PROMISE_SUCCESS(NS_ERROR_UNEXPECTED, promise);
      }

      rv = pwaWin->Load(loadInfo);
      NS_PROMISE_SUCCESS(rv, promise);
    }*/

    window->Focus();
    promise->MaybeResolveWithUndefined();
    return NS_OK;
  }

  rv = OpenWindow(pwa, loadInfo, getter_AddRefs(windowProxy));
  NS_PROMISE_SUCCESS(rv, promise);

  nsCOMPtr<nsIWidget> widget = nsGlobalWindowOuter::Cast(windowProxy)->GetMainWidget();

  nsCOMPtr<nsIFile> iconFile;
  rv = dir->Clone(getter_AddRefs(iconFile));
  NS_PROMISE_SUCCESS(rv, promise);

  rv = iconFile->Append(ICON_FILE);
  NS_PROMISE_SUCCESS(rv, promise);

  widget->SetIcon(iconFile);

  HWND toplevelHWND = ::GetAncestor((HWND)widget->GetNativeData(NS_NATIVE_WINDOW), GA_ROOT);
  if (!toplevelHWND) {
    promise->MaybeReject(NS_ERROR_FAILURE);
    return NS_OK;
  }

  RefPtr<IPropertyStore> propStore;
  if (FAILED(SHGetPropertyStoreForWindow(toplevelHWND, IID_IPropertyStore,
                                         getter_AddRefs(propStore)))) {
    return NS_ERROR_INVALID_ARG;
  }

  nsString groupId;
  rv = GetGroupId(pwa, groupId);
  NS_PROMISE_SUCCESS(rv, promise);

  rv = SetProp(propStore, PKEY_AppUserModel_ID, groupId);
  NS_PROMISE_SUCCESS(rv, promise);

  nsCString name;
  rv = pwa->GetName(name);
  NS_PROMISE_SUCCESS(rv, promise);

  nsString wname = NS_ConvertUTF8toUTF16(name);
  rv = SetProp(propStore, PKEY_AppUserModel_RelaunchDisplayNameResource, wname);
  NS_PROMISE_SUCCESS(rv, promise);

  nsString icon(iconFile->NativePath());
  icon.AppendLiteral(",0");
  rv = SetProp(propStore, PKEY_AppUserModel_RelaunchIconResource, icon);
  NS_PROMISE_SUCCESS(rv, promise);

  nsString command;
  rv = GetLaunchArgs(pwa, command);
  NS_PROMISE_SUCCESS(rv, promise);

  nsCOMPtr<nsIFile> exeFile;
  rv = NS_GetSpecialDirectory(XRE_EXECUTABLE_FILE, getter_AddRefs(exeFile));
  NS_PROMISE_SUCCESS(rv, promise);

  nsString exe(exeFile->NativePath());

  command.Insert(NS_LITERAL_STRING("\" "), 0);
  command.Insert(exe, 0);
  command.Insert(NS_LITERAL_STRING("\""), 0);
  command.Length();
  rv = SetProp(propStore, PKEY_AppUserModel_RelaunchCommand, command);
  NS_PROMISE_SUCCESS(rv, promise);

  if (FAILED(propStore->Commit())) {
    promise->MaybeReject(NS_ERROR_FAILURE);
    return NS_OK;
  }

  promise->MaybeResolveWithUndefined();
  return NS_OK;
}
