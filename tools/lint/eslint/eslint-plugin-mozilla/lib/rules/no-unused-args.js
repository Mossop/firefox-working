/**
 * @fileoverview Rule to flag declared but unused arguments.
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

"use strict";

const { dirname, join } = require("path");
const eslintBasePath = dirname(require.resolve("eslint"));
const astUtils = require(join(eslintBasePath, "rules/utils/ast-utils.js"));

/**
 * Bag of data used for formatting the `unusedVar` lint message.
 * @typedef {Object} UnusedVarMessageData
 * @property {string} varName The name of the unused var.
 */

function isFunctionNode(node) {
  if (astUtils.isFunction(node)) {
    return true;
  }

  if (node.type == "AssignmentPattern") {
    return astUtils.isFunction(node.parent);
  }

  return false;
}

module.exports = {
  meta: {
    type: "problem",
    fixable: "code",
    schema: [
      {
        type: "boolean",
      },
    ],

    docs: {
      description: "Disallow unused arguments",
    },

    messages: {
      unusedArg: "'{{varName}}' is defined but never used.",
      unreadArg: "'{{varName}}' is assigned a value but never used.",
    },
  },

  create(context) {
    let shouldFix = context.options[0] === true;

    const sourceCode = context.getSourceCode();

    /**
     * Generates the message data about the variable being defined and unused,
     * including the ignore pattern if configured.
     * @param {Variable} unusedVar eslint-scope variable object.
     * @returns {UnusedVarMessageData} The message data to be used with this unused variable.
     */
    function getDefinedMessageData(unusedVar) {
      return {
        varName: unusedVar.name,
      };
    }

    const commaMatcher = {
      filter: token => token.value === ",",
    };

    function inRange(maybeToken, bounds) {
      return (
        maybeToken &&
        maybeToken.range[0] >= bounds[0] &&
        maybeToken.range[1] <= bounds[1]
      );
    }

    function findPreviousArg(node, bounds) {
      // Find a previous comma
      let token = sourceCode.getTokenBefore(node, commaMatcher);
      if (inRange(token, bounds)) {
        return token.range[0];
      }

      return bounds[0];
    }

    function findNextArg(node, bounds) {
      // Find a next comma
      let token = sourceCode.getTokenAfter(node, commaMatcher);
      if (inRange(token, bounds)) {
        return token.range[1];
      }

      return bounds[1];
    }

    function nodeToRemove(node) {
      let walkUp = nodeToWalk => {
        if (
          ["RestElement", "AssignmentPattern"].includes(nodeToWalk.parent.type)
        ) {
          nodeToWalk = nodeToWalk.parent;
        }

        if (nodeToWalk.parent.type == "Property") {
          nodeToWalk = nodeToWalk.parent;
        }

        return nodeToWalk;
      };

      node = walkUp(node);

      if (
        (node.parent.type == "ObjectPattern" &&
          node.parent.properties.length == 1) ||
        (node.parent.type == "ArrayPattern" && node.parent.elements.length == 1)
      ) {
        // This will be an empty object or array pattern. Ideally remove it.

        let parent = walkUp(node.parent);
        if (astUtils.isFunction(parent.parent)) {
          // Only remove the pattern if it is the last parameter
          if (
            parent.parent.params[parent.parent.params.length - 1] === parent
          ) {
            return parent;
          }
        } else {
          return nodeToRemove(parent);
        }
      }

      return node;
    }

    function removeNode(fixer, node) {
      let parent = node.parent;

      if (
        !astUtils.isFunction(parent) &&
        !["ObjectPattern", "ArrayPattern"].includes(parent.type)
      ) {
        throw new Error(`Encountered an unexpected parent node ${parent.type}`);
      }

      // Single argument functions are trivial
      if (astUtils.isFunction(parent) && parent.params.length == 1) {
        if (parent.type == "ArrowFunctionExpression") {
          // There may be no parenthesis present. If there is it will be the
          // immediately preceeding token.
          let token = sourceCode.getTokenBefore(node);

          // If there is no parenthesis or the parenthesis is before the start
          // of the arrow function then we must add parenthesis
          if (token?.value != "(" || !inRange(token, parent.range)) {
            return fixer.replaceText(node, "()");
          }
        }

        return fixer.remove(node);
      }

      // The array of parameters or array/object properties.
      let siblings;

      // The range that encompasses the entire set of params/properties.
      let bounds;

      if (astUtils.isFunction(parent)) {
        siblings = parent.params;
        // Parameters cannot have leading or trailing commas
        bounds = [siblings[0].range[0], siblings[siblings.length - 1].range[1]];
      } else if (parent.type == "ObjectPattern") {
        siblings = parent.properties;

        // Strip off the braces
        bounds = [parent.range[0] + 1, parent.range[1] - 1];
      } else if (parent.type == "ArrayPattern") {
        siblings = parent.elements;

        // Strip off the braces
        bounds = [parent.range[0] + 1, parent.range[1] - 1];
      }

      let index = siblings.indexOf(node);
      let isFirst = index == 0;
      let isLast = index == siblings.length - 1;

      let previousPos = findPreviousArg(node, bounds);
      let nextPos = findNextArg(node, bounds);

      let rangeToRemove = [...node.range];

      // Only strip the previous tokens if we're not an array pattern or if
      // this is the last element of the array pattern.
      if (parent.type != "ArrayPattern" || isLast) {
        rangeToRemove[0] = previousPos;
      }

      if (
        // Strip following tokens from the first element unless this is an array
        (isFirst && parent.type != "ArrayPattern") ||
        // Always strip any trailing tokens
        isLast
      ) {
        rangeToRemove[1] = nextPos;
      }

      return fixer.removeRange(rangeToRemove);
    }

    /**
     * Checks whether the given variable is after the last used parameter.
     * @param {eslint-scope.Variable} variable The variable to check.
     * @returns {boolean} `true` if the variable is defined after the last
     * used parameter.
     */
    function isAfterLastUsedArg(variable) {
      const def = variable.defs[0];
      const params = sourceCode.getDeclaredVariables(def.node);
      const posteriorParams = params.slice(params.indexOf(variable) + 1);

      // If any used parameters occur after this parameter, do not report.
      return !posteriorParams.some(v => !!v.references.length || v.eslintUsed);
    }

    /**
     * Gets an array of variables without read references.
     * @param {Scope} scope an eslint-scope Scope object.
     * @param {Variable[]} unusedArgs an array that saving result.
     * @returns {Variable[]} unused variables of the scope and descendant scopes.
     * @private
     */
    function collectUnusedVariables(scope, unusedArgs, unreadArgs) {
      if (scope.type !== "global") {
        for (let variable of scope.variables) {
          // explicit global variables don't have definitions.
          let def = variable.defs[0];
          if (!def) {
            continue;
          }

          if (def.type !== "Parameter") {
            continue;
          }

          if (variable.name.startsWith("_")) {
            continue;
          }

          let references = variable.references.filter(ref => !ref.init);

          if (references.some(ref => ref.isReadOnly())) {
            continue;
          }

          // Only for function parameters.
          if (isFunctionNode(def.name.parent)) {
            // skip any setter argument
            if (
              (def.node.parent.type === "Property" ||
                def.node.parent.type === "MethodDefinition") &&
              def.node.parent.kind === "set"
            ) {
              continue;
            }

            // skip used variables
            if (!isAfterLastUsedArg(variable)) {
              continue;
            }
          }

          if (references.length) {
            unreadArgs.push(variable);
          } else {
            unusedArgs.push(variable);
          }
        }
      }

      for (let childScope of scope.childScopes) {
        collectUnusedVariables(childScope, unusedArgs, unreadArgs);
      }

      return unusedArgs;
    }

    //--------------------------------------------------------------------------
    // Public
    //--------------------------------------------------------------------------

    return {
      "Program:exit": function (programNode) {
        let unusedArgs = [];
        let unreadArgs = [];
        collectUnusedVariables(
          sourceCode.getScope(programNode),
          unusedArgs,
          unreadArgs
        );

        for (let unusedVar of unreadArgs) {
          context.report({
            node: unusedVar.identifiers[0],
            messageId: "unreadArg",
            data: getDefinedMessageData(unusedVar),
          });
        }

        for (let unusedVar of unusedArgs) {
          let messageData = getDefinedMessageData(unusedVar);
          context.report({
            node: unusedVar.identifiers[0],
            messageId: "unusedArg",
            data: messageData,
            fix: shouldFix
              ? fixer =>
                  removeNode(fixer, nodeToRemove(unusedVar.identifiers[0]))
              : null,
          });
        }
      },
    };
  },
};
