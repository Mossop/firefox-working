const fs = require("fs");
const path = require("path");

const SRCDIR = "/Users/dave/mozilla/source/trunk";
const DIST =
  "/Users/dave/mozilla/build/trunk/obj-browser-opt-artifact/dist/bin";

const MAPPINGS = new Map();

function addMappings(bin, prefix) {
  let list = fs.readdirSync(bin, {
    withFileTypes: true,
  });

  for (let entry of list) {
    let target = path.join(bin, entry.name);
    if (entry.isSymbolicLink()) {
      let linkTarget = fs.readlinkSync(target);
      if (!linkTarget.startsWith(SRCDIR)) {
        continue;
      }

      let srcPath = path.relative(SRCDIR, linkTarget);
      let srcDirUri = `moz-src:///${srcPath}`;
      console.log(`${prefix}${entry.name} => ${srcDirUri}`);
      MAPPINGS.set(`${prefix}${entry.name}`, srcDirUri);

      if (entry.name.endsWith(".sys.mjs")) {
        MAPPINGS.set(
          `${prefix}${entry.name.substring(0, entry.name.length - 8)}.jsm`,
          `${srcDirUri.substring(0, srcDirUri.length - 8)}.jsm`
        );
      }

      if (entry.name.endsWith(".jsm")) {
        MAPPINGS.set(
          `${prefix}${entry.name.substring(0, entry.name.length - 4)}.sys.mjs`,
          `${srcDirUri.substring(0, srcDirUri.length - 4)}.sys.mjs`
        );
      }
    } else if (entry.isDirectory()) {
      addMappings(target, `${prefix}${entry.name}/`);
    }
  }
}

function replaceMappings(dir) {
  let list = fs
    .readFileSync(path.join(SRCDIR, "modulereferences.txt"), {
      encoding: "utf8",
    })
    .split("\n");

  for (let file of list) {
    if (!file) {
      continue;
    }

    let target = path.join(SRCDIR, file);

    try {
      let original = fs.readFileSync(target, { encoding: "utf8" });
      let updated = original;

      for (let [source, target] of MAPPINGS) {
        updated = updated.replaceAll(source, target);
      }

      if (updated != original) {
        fs.writeFileSync(target, updated, { encoding: "utf8" });
        // console.log(`Updated ${target}`);
      } else {
        console.error(`Skipped ${target}`);
      }
    } catch (e) {
      console.error(e);
    }
  }
}

addMappings(path.join(DIST, "modules"), "resource://gre/modules/");
addMappings(path.join(DIST, "browser", "modules"), "resource:///modules/");
addMappings(path.join(DIST, "browser", "modules"), "resource://app/modules/");

replaceMappings(SRCDIR);
