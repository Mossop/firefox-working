const { FileUtils } = ChromeUtils.importESModule(
  "moz-src:///toolkit/modules/FileUtils.sys.mjs"
);

function run_test() {
  Assert.ok(FileUtils.File("~").equals(FileUtils.getDir("Home", [])));
}
