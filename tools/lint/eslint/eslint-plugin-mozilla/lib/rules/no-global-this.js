/**
 * @fileoverview Reject attempts to use the global object in jsms.
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

"use strict";

// -----------------------------------------------------------------------------
// Rule Definition
// -----------------------------------------------------------------------------

function serialize(node) {
  switch (node.type) {
    case "MemberExpression":
      return `${serialize(node.object)}.${serialize(node.property)}`;
    case "Identifier":
      return node.name;
  }

  throw new Error(`Unknown node type ${node.type}, bail out.`);
}

function isGlobalThis(context, node) {
  for (let ancestor of context.getAncestors()) {
    if (
      ancestor.type == "FunctionDeclaration" ||
      ancestor.type == "FunctionExpression"
    ) {
      return false;
    }
  }

  return true;
}

function isCallTo(context, node, funcname) {
  let parent = node.parent;
  if (parent.type != "CallExpression") {
    return false;
  }

  try {
    let func = serialize(parent.callee);
    return func == funcname;
  } catch (e) {
    return false;
  }
}

function isAssignment(context, node) {
  return (
    node.parent.type == "MemberExpression" &&
    node.parent.object === node &&
    node.parent.parent.type == "AssignmentExpression"
  );
}

module.exports = {
  known: [
    "ChromeUtils.import",
    "ChromeUtils.defineModuleGetter",
    "XPCOMUtils.defineLazyGetter",
    "XPCOMUtils.defineLazyScriptGetter",
    "XPCOMUtils.defineLazyGlobalGetters",
    "XPCOMUtils.defineLazyServiceGetter",
    "XPCOMUtils.defineLazyServiceGetters",
    "XPCOMUtils.defineLazyModuleGetter",
    "XPCOMUtils.defineLazyModuleGetters",
    "XPCOMUtils.defineLazyPreferenceGetter",
    "XPCOMUtils.defineConstant",
    "XPCOMUtils.defineLazyProxy",
    "Object.defineProperty",
    "Services.scriptloader.loadSubScript",
  ],

  checkFor(use) {
    return function(context) {
      return {
        ThisExpression(node) {
          if (!isGlobalThis(context, node)) {
            return;
          }

          if (isCallTo(context, node, use)) {
            context.report({
              node,
              message: `JS modules should not pass the global this to ${use}.`,
            });
          }
        },
      };
    };
  },

  checkAssignment() {
    return function(context) {
      return {
        ThisExpression(node) {
          if (!isGlobalThis(context, node)) {
            return;
          }

          if (!isAssignment(context, node)) {
            return;
          }

          context.report({
            node,
            message: `JS modules should not assign properties to the global this.`,
          });
        },
      };
    };
  },

  checkUnknown() {
    let known = this.known;

    return function(context) {
      return {
        ThisExpression(node) {
          if (!isGlobalThis(context, node)) {
            return;
          }

          for (let func of known) {
            if (isCallTo(context, node, func)) {
              return;
            }
          }

          if (isAssignment(context, node)) {
            return;
          }

          context.report({
            node,
            message: `JS modules should not use the global this.`,
          });
        },
      };
    };
  },
};
