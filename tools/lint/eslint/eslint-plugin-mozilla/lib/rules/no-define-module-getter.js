/**
 * @fileoverview Reject attempts to use the old-style defineModuleGetter
 * functions on the global this object.
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

"use strict";

// -----------------------------------------------------------------------------
// Rule Definition
// -----------------------------------------------------------------------------

const helpers = require("../helpers");

const XPCOMUtils = "resource://gre/modules/XPCOMUtils.jsm";

function isIdentifier(node, id) {
  return node && node.type === "Identifier" && node.name === id;
}

function isLiteral(node, literal) {
  return node && node.type === "Literal" && node.value === literal;
}

function isThis(node) {
  return node && node.type === "ThisExpression";
}

module.exports = {
  meta: {
    schema: [],
    fixable: "code",
  },

  create(context) {
    let hasXPCOMUtils = false;

    return {
      CallExpression(node) {
        if (node.callee.type !== "MemberExpression") {
          return;
        }

        for (let parent of context.getAncestors()) {
          if (
            parent.type == "FunctionDeclaration" ||
            parent.type == "FunctionExpression"
          ) {
            return;
          }
        }

        if (isIdentifier(node.callee.object, "ChromeUtils")) {
          if (
            isIdentifier(node.callee.property, "import") &&
            isLiteral(node.arguments[0], XPCOMUtils)
          ) {
            hasXPCOMUtils = true;
          } else if (
            isIdentifier(node.callee.property, "defineModuleGetter") &&
            isThis(node.arguments[0]) &&
            node.arguments[1].type === "Literal" &&
            node.arguments[2].type === "Literal"
          ) {
            context.report({
              node,
              message:
                "Use XPCOMUtils.lazyImport instead of ChromeUtils.defineModuleGetter.",
              fix: fixer => {
                let fixes = [];
                if (!hasXPCOMUtils) {
                  fixes.push(
                    fixer.insertTextBefore(
                      node,
                      `const { XPCOMUtils } = ChromeUtils.import(\"${XPCOMUtils}\");\n`
                    )
                  );
                  hasXPCOMUtils = true;
                }

                fixes.push(
                  fixer.replaceText(
                    node,
                    `const { ${
                      node.arguments[1].value
                    } } = XPCOMUtils.lazyImport("${node.arguments[2].value}")`
                  )
                );

                return fixes;
              },
            });
          }
        } else if (isIdentifier(node.callee.object, "XPCOMUtils")) {
          if (
            isIdentifier(node.callee.property, "defineLazyModuleGetters") &&
            isThis(node.arguments[0]) &&
            node.arguments[1].type === "ObjectExpression"
          ) {
            context.report({
              node,
              message:
                "Use XPCOMUtils.lazyImport instead of XPCOMUtils.defineLazyModuleGetters.",
              fix: fixer => {
                let imports = [];
                for (let property of node.arguments[1].properties) {
                  imports.push(
                    `const { ${property.key.name} } = XPCOMUtils.lazyImport("${
                      property.value.value
                    }")`
                  );
                }

                return fixer.replaceText(node, imports.join(";\n"));
              },
            });
          } else if (
            isIdentifier(node.callee.property, "defineLazyServiceGetter") &&
            isThis(node.arguments[0]) &&
            node.arguments[1].type === "Literal"
          ) {
            context.report({
              node,
              message:
                "Use XPCOMUtils.lazyService instead of XPCOMUtils.defineLazyServiceGetter.",
              fix: fixer => {
                let iface = "";
                if (node.arguments.length > 3) {
                  iface = `, ${helpers.getASTSource(node.arguments[3])}`;
                }

                return fixer.replaceText(
                  node,
                  `const ${node.arguments[1].value} = XPCOMUtils.lazyService("${
                    node.arguments[2].value
                  }"${iface})`
                );
              },
            });
          } else if (
            isIdentifier(node.callee.property, "defineLazyServiceGetters") &&
            isThis(node.arguments[0]) &&
            node.arguments[1].type === "ObjectExpression"
          ) {
            context.report({
              node,
              message:
                "Use XPCOMUtils.lazyService instead of XPCOMUtils.defineLazyServiceGetters.",
              fix: fixer => {
                let imports = [];
                for (let property of node.arguments[1].properties) {
                  let contract = property.value.elements[0].value;
                  let iface = "";
                  if (property.value.elements.length > 1) {
                    iface = `, ${helpers.getASTSource(
                      property.value.elements[1]
                    )}`;
                  }

                  imports.push(
                    `const ${
                      property.key.name
                    } = XPCOMUtils.lazyService("${contract}"${iface})`
                  );
                }

                return fixer.replaceText(node, imports.join(";\n"));
              },
            });
          }
        }
      },
    };
  },
};
