/* eslint-env node */
const ts = require("typescript");
const path = require("path");
const fs = require("fs");

/**
 * @param {Map<string, string>} modules
 * @returns {ts.CompilerHost}
 */
function createCompilerHost(modules) {
  return {
    getSourceFile,
    getDefaultLibFileName: options => ts.getDefaultLibFilePath(options),
    writeFile: (fileName, content) => {},
    getCurrentDirectory: () => ts.sys.getCurrentDirectory(),
    getDirectories: path => ts.sys.getDirectories(path),
    getCanonicalFileName: fileName =>
      ts.sys.useCaseSensitiveFileNames ? fileName : fileName.toLowerCase(),
    getNewLine: () => ts.sys.newLine,
    useCaseSensitiveFileNames: () => ts.sys.useCaseSensitiveFileNames,
    fileExists: fileName => ts.sys.fileExists(fileName),
    readFile: fileName => ts.sys.readFile(fileName),
    resolveModuleNames,
  };

  /**
   * @param {string} fileName
   * @param {ts.ScriptTarget} languageVersion
   * @param {(message: string) => void} [onError]
   */
  function getSourceFile(fileName, languageVersion, onError = undefined) {
    const sourceText = ts.sys.readFile(fileName);
    return sourceText !== undefined
      ? ts.createSourceFile(fileName, sourceText, languageVersion)
      : undefined;
  }

  /**
   * @param {string[]} moduleNames
   * @param {string} containingFile
   * @returns {ts.ResolvedModule[]}
   */
  function resolveModuleNames(moduleNames, containingFile) {
    return moduleNames.map(moduleName => {
      if (!moduleName.endsWith(".sys.mjs")) {
        return undefined;
      }

      let leafPos = moduleName.lastIndexOf("/");
      if (leafPos <= 0) {
        return undefined;
      }

      let leafName = moduleName.substring(leafPos + 1);
      if (modules.has(leafName)) {
        return { resolvedFileName: modules.get(leafName) };
      }

      return undefined;
    });
  }
}

/**
 * @param {string} root
 * @param {Map<string, string>} modules
 * @returns {Map<string, string>}
 */
function buildModuleList(root = __dirname, modules = new Map()) {
  let dir = fs.opendirSync(root);

  try {
    let child;
    while ((child = dir.readSync())) {
      if (child.name.startsWith(".")) {
        continue;
      }

      if (child.isDirectory()) {
        buildModuleList(path.join(root, child.name), modules);
      }

      if (child.isFile() && child.name.endsWith(".sys.mjs")) {
        if (modules.has(child.name)) {
          console.warn("Duplicate module leaf name", child.name);
        }
        modules.set(child.name, path.join(root, child.name));
      }
    }

    return modules;
  } finally {
    dir.closeSync();
  }
}

/**
 * @returns {ts.Program}
 */
function compile() {
  let modules = buildModuleList();

  /** @type {ts.CompilerOptions} */
  let options = {
    allowJs: true,
    checkJs: true,
    noEmit: true,
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ESNext,
    lib: ["lib.dom.d.ts", "lib.esnext.d.ts"],
  };

  const host = createCompilerHost(modules);
  return ts.createProgram(
    [path.join(__dirname, "mozilla.d.ts"), ...modules.values()],
    options,
    host
  );
}

let program = compile();

let allDiagnostics = ts.getPreEmitDiagnostics(program);

allDiagnostics.forEach(diagnostic => {
  if (diagnostic.file) {
    let { line, character } = ts.getLineAndCharacterOfPosition(
      diagnostic.file,
      diagnostic.start
    );
    let message = ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n");
    console.log(
      `${diagnostic.file.fileName} (${line + 1},${character + 1}): ${message}`
    );
  } else {
    console.log(ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n"));
  }
});
