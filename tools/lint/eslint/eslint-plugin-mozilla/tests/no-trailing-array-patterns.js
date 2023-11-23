/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

// ------------------------------------------------------------------------------
// Requirements
// ------------------------------------------------------------------------------

var rule = require("../lib/rules/no-trailing-array-patterns");
var RuleTester = require("eslint").RuleTester;

const ruleTester = new RuleTester({ parserOptions: { ecmaVersion: "latest" } });

// ------------------------------------------------------------------------------
// Tests
// ------------------------------------------------------------------------------

function trailingPatterns(options) {
  return [
    {
      messageId: "trailingPatterns",
      ...options,
    },
  ];
}

ruleTester.run("no-trailing-array-patterns", rule, {
  valid: [
    // A single trailing comma is not considered to be a destructuring pattern
    "let [a, b, c, ] = bar",
    "let [] = bar",
    "([a, b,]) => {}",
    "for (let [a, b,] of foo) {}",
  ],
  invalid: [
    {
      code: "let [a, b, , ] = bar",
      output: "let [a, b] = bar",
      errors: trailingPatterns({ column: 10, endColumn: 14 }),
    },
    {
      code: "([a, b, ,]) => {}",
      output: "([a, b]) => {}",
      errors: trailingPatterns({ column: 7, endColumn: 10 }),
    },
    {
      code: "for (let [a, b,,] of foo) {}",
      output: "for (let [a, b] of foo) {}",
      errors: trailingPatterns({ column: 15, endColumn: 17 }),
    },
  ],
});
