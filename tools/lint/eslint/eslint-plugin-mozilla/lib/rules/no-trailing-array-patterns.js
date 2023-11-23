/**
 * @fileoverview Rule to flag trailing unused array patterns
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

"use strict";

module.exports = {
  meta: {
    type: "problem",
    fixable: "code",
    schema: [],

    docs: {
      description: "Disallow unused arguments",
    },

    messages: {
      trailingPatterns: "Unexpected trailing destructuring array pattern.",
    },
  },

  create(context) {
    const sourceCode = context.getSourceCode();

    return {
      ArrayPattern(node) {
        if (!node.elements.length) {
          return;
        }

        if (!node.elements[node.elements.length - 1]) {
          let last = node.elements.findLast(n => !!n);
          let lastPos = last ? last.range[1] : node.range[0] + 1;

          context.report({
            node,
            messageId: "trailingPatterns",
            loc: {
              start: sourceCode.getLocFromIndex(lastPos),
              end: sourceCode.getLocFromIndex(node.range[1] - 1),
            },
            fix(fixer) {
              return fixer.removeRange([lastPos, node.range[1] - 1]);
            },
          });
        }
      },
    };
  },
};
