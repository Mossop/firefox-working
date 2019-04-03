/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const EXPORTED_SYMBOLS = ["PWAService"];

const { XPCOMUtils } = ChromeUtils.import(
  "resource://gre/modules/XPCOMUtils.jsm"
);
const { PWABase, PWAServiceBase } = ChromeUtils.import(
  "resource:///modules/PWACommon.jsm"
);
ChromeUtils.defineModuleGetter(
  this,
  "KeyValueService",
  "resource://gre/modules/kvstore.jsm"
);
ChromeUtils.defineModuleGetter(this, "OS", "resource://gre/modules/osfile.jsm");
ChromeUtils.defineModuleGetter(
  this,
  "Services",
  "resource://gre/modules/Services.jsm"
);
ChromeUtils.defineModuleGetter(
  this,
  "NetUtil",
  "resource://gre/modules/NetUtil.jsm"
);
ChromeUtils.defineModuleGetter(
  this,
  "FileUtils",
  "resource://gre/modules/FileUtils.jsm"
);
ChromeUtils.defineModuleGetter(
  this,
  "BrowserWindowTracker",
  "resource:///modules/BrowserWindowTracker.jsm"
);
ChromeUtils.defineModuleGetter(
  this,
  "PageActions",
  "resource:///modules/PageActions.jsm"
);
ChromeUtils.defineModuleGetter(
  this,
  "AppConstants",
  "resource://gre/modules/AppConstants.jsm"
);
XPCOMUtils.defineLazyServiceGetter(
  this,
  "UUIDGen",
  "@mozilla.org/uuid-generator;1",
  "nsIUUIDGenerator"
);
XPCOMUtils.defineLazyServiceGetter(
  this,
  "PWASupport",
  "@mozilla.org/pwa/native-support;1",
  "nsINativePWASupport"
);
XPCOMUtils.defineLazyGlobalGetters(this, ["fetch"]);

const STREAM_SEGMENT_SIZE = 4096;
const PR_UINT32_MAX = 0xffffffff;

const BinaryInputStream = Components.Constructor(
  "@mozilla.org/binaryinputstream;1",
  "nsIBinaryInputStream",
  "setInputStream"
);
const StorageStream = Components.Constructor(
  "@mozilla.org/storagestream;1",
  "nsIStorageStream",
  "init"
);
const BufferedOutputStream = Components.Constructor(
  "@mozilla.org/network/buffered-output-stream;1",
  "nsIBufferedOutputStream",
  "init"
);
const StreamListener = Components.Constructor(
  "@mozilla.org/network/simple-stream-listener;1",
  "nsISimpleStreamListener",
  "init"
);

const SIZE_RE = /(\d+)x\1/;

function getIconSizes(iconData) {
  return Array.from(iconData.sizes.matchAll(SIZE_RE))
    .filter(m => m)
    .map(m => parseInt(m[1]));
}

function getClosestSize(iconData, target) {
  let sizes = getIconSizes(iconData);
  if (sizes.length == 0) {
    return null;
  }

  let closest = sizes[0];
  for (let size of sizes) {
    if (Math.abs(target - closest) > Math.abs(target - size)) {
      closest = size;
    }
  }

  return closest;
}

class PWAParent extends PWABase {
  load(loadInfo = null) {
    PWASupport.load(this, new FileUtils.File(this._dir), loadInfo);
  }

  getIcon(size) {
    let closest = null;

    for (let icon of this._manifest.icons) {
      let best = getClosestSize(icon, size);
      if (!best) {
        continue;
      }

      if (!closest || Math.abs(size - closest.size) > Math.abs(size - best)) {
        closest = { size: best, src: icon.src };
      }
    }

    return closest.src;
  }

  static fromJSON({ id, dir, manifest }) {
    return new PWAParent(id, dir, manifest);
  }
}

const uuid = () => {
  return UUIDGen.generateUUID().toString();
};

function promiseBlobAsOctets(blob) {
  return new Promise((resolve, reject) => {
    let reader = new FileReader();
    reader.addEventListener("load", () => {
      resolve(Array.from(reader.result).map(c => c.charCodeAt(0)));
    });
    reader.addEventListener("error", reject);
    reader.readAsBinaryString(blob);
  });
}

function promiseImage(stream, type) {
  return new Promise((resolve, reject) => {
    let imgTools = Cc["@mozilla.org/image/tools;1"].getService(Ci.imgITools);

    imgTools.decodeImageAsync(
      stream,
      type,
      (image, result) => {
        if (!Components.isSuccessCode(result)) {
          reject();
          return;
        }

        resolve(image);
      },
      Services.tm.currentThread
    );
  });
}

function fetchToStream(uri, stream) {
  return new Promise((resolve, reject) => {
    let listener = new StreamListener(stream, {
      onStartRequest(request) {},

      onStopRequest(request, status) {
        if (request != channel) {
          // Indicates that a redirect has occurred. We don't care about the result
          // of the original channel.
          return;
        }

        stream.close();

        if (!Components.isSuccessCode(status)) {
          reject(
            Components.Exception(
              `Failed to download icon from '${uri}'.`,
              status
            )
          );
          return;
        }

        if (request instanceof Ci.nsIHttpChannel) {
          if (!request.requestSucceeded) {
            reject(
              Components.Exception(
                `Icon at "${uri}" failed to load: '${
                  this.channel.responseStatusText
                }'.`,
                Cr.NS_ERROR_FAILURE
              )
            );
            return;
          }
        }

        resolve(request);
      },
    });

    let callbacks = {
      asyncOnChannelRedirect(oldChannel, newChannel, flags, callback) {
        if (oldChannel == channel) {
          channel = newChannel;
        }

        callback.onRedirectVerifyCallback(Cr.NS_OK);
      },
    };

    let channel = NetUtil.newChannel({
      uri,
      loadUsingSystemPrincipal: true,
    });

    channel.notificationCallbacks = callbacks;

    if (channel instanceof Ci.nsIHttpChannel) {
      try {
        let acceptHeader = Services.prefs.getCharPref("image.http.accept");
        this.channel.setRequestHeader("Accept", acceptHeader, false);
      } catch (e) {
        // Failing to get the pref or set the header is ignorable.
      }
    }

    if (channel instanceof Ci.nsIHttpChannelInternal) {
      channel.blockAuthPrompt = true;
    }

    try {
      channel.asyncOpen(listener);
    } catch (e) {
      reject(e);
    }
  });
}

async function writeBufferToDisk(buffer, path) {
  let file = await OS.File.open(path, { truncate: true });
  let view = new Int8Array(buffer);
  await file.write(view);
  await file.close();
}

async function downloadIcon(iconData, dir) {
  let dataBuffer = new StorageStream(STREAM_SEGMENT_SIZE, PR_UINT32_MAX);
  // storage streams do not implement writeFrom so wrap it with a buffered stream.
  let outStream = new BufferedOutputStream(
    dataBuffer.getOutputStream(0),
    STREAM_SEGMENT_SIZE * 2
  );
  let request = await fetchToStream(iconData.src, outStream);

  let stream = new BinaryInputStream(dataBuffer.newInputStream(0));
  let buffer = new ArrayBuffer(dataBuffer.length);
  stream.readArrayBuffer(buffer.byteLength, buffer);

  let type = request.contentType;
  let blob = new Blob([buffer], { type });

  if (type != "image/svg+xml") {
    let octets = await promiseBlobAsOctets(blob);
    let sniffer = Cc["@mozilla.org/image/loader;1"].createInstance(
      Ci.nsIContentSniffer
    );
    type = sniffer.getMIMETypeFromContent(request, octets, octets.length);

    if (!type) {
      throw Components.Exception(
        `Icon at '${iconData.src}' did not match a known mimetype.`,
        Cr.NS_ERROR_FAILURE
      );
    }

    blob = blob.slice(0, blob.size, type);
  }

  if (type != "image/svg+xml") {
    let image;
    try {
      image = await promiseImage(dataBuffer.newInputStream(0), type);
    } catch (e) {
      throw Components.Exception(
        `Icon at '${iconData.src}' could not be decoded.`,
        Cr.NS_ERROR_FAILURE
      );
    }

    try {
      // Not sure what to do in these cases.
      if (image.animated) {
        return null;
      }

      if (image.type == Ci.imgIContainer.TYPE_VECTOR) {
        return null;
      }
    } catch (e) {}

    iconData.sizes = `${image.width}x${image.height}`;
  }

  iconData.type = type;

  let path = OS.Path.join(dir, uuid());
  let file = new FileUtils.File(path);
  await writeBufferToDisk(buffer, path);
  iconData.src = Services.io.newFileURI(file).spec;

  iconData.QueryInterface = ChromeUtils.generateQI([Ci.nsIPWAIcon]);

  return iconData;
}

const PWACache = {
  init() {
    this._cache = new Map();

    let loaded = false;
    this._loadDB().then(
      () => (loaded = true),
      error => {
        console.error(error);
        loaded = true;
      }
    );
    Services.tm.spinEventLoopUntil(() => loaded);

    this.flush();
  },

  flush() {
    Services.ppmm.sharedData.set("pwa", JSON.stringify(this));
    Services.ppmm.sharedData.flush();
  },

  async _loadDB() {
    this._path = OS.Path.join(OS.Constants.Path.profileDir, "pwa");
    await OS.File.makeDir(this._path, {
      ignoreExisting: true,
    });

    this._db = await KeyValueService.getOrCreate(this._path, "pwa");
    for (const { key: id, value: data } of await this._db.enumerate()) {
      let pwa = PWAParent.fromJSON(JSON.parse(data));
      this._cache.set(id, pwa);
    }
  },

  async getPWADir(id) {
    let path = OS.Path.join(this._path, id);

    await OS.File.makeDir(path, {
      ignoreExisting: true,
    });

    return path;
  },

  get(id) {
    return this._cache.get(id);
  },

  set(id, pwa) {
    this._cache.set(id, pwa);
    let data = JSON.stringify(pwa);
    this._db.put(id, data);
    data = JSON.stringify(this);

    this.flush();
  },

  delete(id) {
    this._cache.delete(id);
    this._db.delete(id);

    this.flush();
  },

  list() {
    return Array.from(this._cache.values());
  },

  toJSON() {
    let manifests = {};

    for (let pwa of this.list()) {
      manifests[pwa.id] = pwa;
    }

    return manifests;
  },
};

class PWAServiceParent extends PWAServiceBase {
  constructor() {
    super();
    PWACache.init();
    Services.ppmm.addMessageListener("PWA:Load", this);
    Services.ppmm.addMessageListener("PWA:OpenInBrowser", this);

    PageActions.addAction(
      new PageActions.Action({
        id: "pwa",
        title: "Install as Application",
        pinnedToUrlbar: true,
        onCommand: (event, buttonNode) => this.clickPageAction(buttonNode),
      })
    );
  }

  receiveMessage({ name, data }) {
    if (name == "PWA:Load") {
      let { id, loadInfo } = data;
      let pwa = this.get(id);
      if (pwa) {
        pwa.load(loadInfo);
      }
    } else if (name == "PWA:OpenInBrowser") {
      let { loadInfo } = data;
      this.openInBrowser(loadInfo);
    }
  }

  async clickPageAction(buttonNode) {
    let gBrowser = buttonNode.ownerGlobal.gBrowser;
    let browser = gBrowser.selectedBrowser;
    let pwa = await this.install(browser);

    pwa.open();
    let oldTab = gBrowser.getTabForBrowser(browser);
    if (gBrowser.visibleTabs.length <= 1) {
      gBrowser.selectedTab = gBrowser.addTab("about:home", {
        triggeringPrincipal: Services.scriptSecurityManager.getSystemPrincipal(),
      });
    }
    gBrowser.removeTab(oldTab, { animate: false });
  }

  fixupManifest(browser, siteManifest, tabIcon, richIcon) {
    // Choosing to only support URLs for this case.
    let pageUrl = browser.currentURI.QueryInterface(Ci.nsIURL);

    let title = browser.contentTitle;
    let results = /^.*[\-|](.+)$/.exec(title);
    if (results) {
      title = results[1].trim();
    }

    let manifest = Object.assign(
      {
        sourceUrl: pageUrl.prePath + "/manifest.json",
        name: title,
        start_url: pageUrl.prePath + pageUrl.directory,
        scope: pageUrl.prePath + "/",
        display: "standalone",
      },
      siteManifest
    );

    if (!("short_name" in manifest)) {
      manifest.short_name = manifest.name;
    }

    if (!("icons" in manifest) || !Array.isArray(manifest.icons)) {
      manifest.icons = [];
    } else {
      manifest.icons = manifest.icons.filter(i => "src" in i);
    }

    if (manifest.icons.length == 0) {
      if (tabIcon) {
        manifest.icons.push({ src: tabIcon });
      }
      if (richIcon) {
        manifest.icons.push({ src: richIcon });
      }
    }

    return manifest;
  }

  async downloadManifest(url) {
    try {
      let response = await fetch(url);
      let manifest = await response.json();
      manifest.sourceUrl = url;
      return manifest;
    } catch (e) {
      return {};
    }
  }

  async install(browser) {
    let browserInfo = {
      manifestUrl: null,
      tabIcon: null,
      richIcon: null,
    };

    let handler = browser.ownerGlobal.PWAHandler;
    if (handler) {
      browserInfo = handler.getBrowserInfo(browser);
    }

    let { manifestUrl, tabIcon, richIcon } = browserInfo;

    let manifest = manifestUrl ? await this.downloadManifest(manifestUrl) : {};
    manifest = this.fixupManifest(browser, manifest, tabIcon, richIcon);

    let base = Services.io.newURI(manifest.sourceUrl);
    let resolved = u => {
      return Services.io.newURI(u, null, base).spec;
    };

    // Make the necessary urls absolute.

    // MDN and Google disagree on whether start_url is relative to the manifest
    // or the scope, I've chosen manifest here since scope seems to be optional.
    manifest.start_url = resolved(manifest.start_url);

    if ("scope" in manifest) {
      // MDN and Google agree on this!
      manifest.scope = resolved(manifest.scope);
    } else {
      manifest.scope = Services.io.newURI(manifest.start_url).prePath;
    }

    // Look for already installed PWAs
    for (let pwa of await this.list()) {
      if (pwa.equalsManifest(manifest)) {
        // Upgrade PWA manifest???
        return pwa;
      }
    }

    let id = uuid();
    let dir = await PWACache.getPWADir(id);
    await OS.File.makeDir(dir, {
      ignoreExisting: true,
    });

    let fetchIcon = async iconData => {
      // Google doesn't say what icon srcs are relative to, MDN says the manifest.
      iconData.src = resolved(iconData.src);
      try {
        return await downloadIcon(iconData, dir);
      } catch (e) {
        Cu.reportError(e);
        return null;
      }
    };

    let iconPromises = manifest.icons.map(fetchIcon);
    manifest.icons = (await Promise.all(iconPromises)).filter(i => i);

    let pwa = new PWAParent(id, dir, manifest);
    await PWASupport.install(pwa, new FileUtils.File(dir));
    PWACache.set(id, pwa);
    return pwa;
  }

  openInBrowser(loadInfo) {
    // XXX Use the default system browser.
    let win = BrowserWindowTracker.getTopWindow({
      private: false,
      allowPopups: false,
    });
    if (win) {
      win.gBrowser.selectedTab = win.gBrowser.addWebTab(loadInfo.uri, {});
      win.focus();
    } else {
      let args = Cc["@mozilla.org/array;1"].createInstance(Ci.nsIMutableArray);

      let wrapper = Cc["@mozilla.org/supports-string;1"].createInstance(
        Ci.nsISupportsString
      );
      wrapper.data = loadInfo.uri;
      args.appendElement(wrapper);
      win = Services.ww.openWindow(
        null,
        AppConstants.BROWSER_CHROME_URL,
        "_blank",
        "all,dialog=no",
        args
      );
      win.focus();
    }
  }

  get(id) {
    return PWACache.get(id);
  }

  list() {
    return PWACache.list();
  }

  delete(pwa) {
    PWACache.delete(pwa.id);
  }
}

const PWAService = new PWAServiceParent();
