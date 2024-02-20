type Imports = {
  "resource:///modules/BrowserGlue.sys.mjs": typeof import("../browser/components/BrowserGlue.sys.mjs");
  // ...
};

type Module<I> = I extends keyof Imports ? Imports[I] : any;

type Imported<T> = {
  readonly [K in keyof T]: T[K] extends keyof Imports
    ? K extends keyof Imports[T[K]]
      ? Imports[T[K]][K]
      : any
    : any;
};

declare const ChromeUtils: {
  defineESModuleGetters<I, T>(target: I, list: T): I & Imported<T>;

  importESModule<I>(module: I): Module<I>;

  defineLazyGetter<I, K extends string, T>(target: I, key: K, getter: () => T): I & { [P in K]: T }
};

declare const Services: any;
declare const Cc: any;
declare const Ci: any;
declare const Cr: any;
declare const Cu: any;
declare const Components: any;
declare const console: any;
