/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

import rule from "../lib/rules/require-snake-case-const.mjs";
import { RuleTester } from "eslint";

const ruleTester = new RuleTester();

function invalidCode(code, messageId, data, output) {
  let testCase = { code, errors: [{ messageId, data }] };
  if (output !== undefined) {
    testCase.output = output;
  }
  return testCase;
}

ruleTester.run("require-snake-case-const", rule, {
  valid: [
    // Top level valid const declarations
    "const SCREAMING_SNAKE = 1;",
    "const SCREAMING_SNAKE_CASE = 2;",
    "const A = 3;",
    "const kFoo = 4;",
    "const kFooBar = 5;",
    "const gFoo = 6;",
    "const gBar = 7;",
    "const lazy = {};",

    // Top level valid let/var declarations
    "let normalName = 1;",
    "var anotherName = 2;",
    "let gFoo = 3;",
    "var gBar = 4;",

    // Inner block valid const declarations
    "function foo() { const SCREAMING_SNAKE = 1; }",
    "function foo() { const kFoo = 1; }",
    "function foo() { const arrowFunc = () => {}; }",
    "if (true) { const myArrow = () => 42; }",
    "{ const INNER_CONST = 1; }",

    // Inner block valid let/var declarations
    "function foo() { let normalName = 1; }",
    "function foo() { var anotherName = 2; }",
    "if (true) { let x = 1; }",

    // Destructuring exceptions in inner blocks (only Ci.property and nsI* variables)
    "function foo() { const { bar } = Ci.nsIFoo; }",
    "function foo() { const { x } = nsIBar; }",
    "if (true) { const { prop } = Ci.nsIInterface; }",

    // Valid destructuring patterns
    "const { FOO, BAR } = obj;",
    "const { kFoo, kBar } = obj;",
    "const [FIRST, SECOND] = arr;",
    "function foo() { const { FOO, BAR } = obj; }",
    "function foo() { const [kFirst, kSecond] = arr; }",

    // Mixed valid cases
    `const GLOBAL_CONST = 1;
     let globalLet = 2;
     function test() {
       const LOCAL_CONST = 3;
       let localLet = 4;
       const arrow = () => {};
     }`,
  ],

  invalid: [
    // Top level invalid const declarations (should autofix to let)
    invalidCode(
      "const normalName = 1;",
      "constNaming",
      { name: "normalName" },
      "let normalName = 1;"
    ),
    invalidCode(
      "const camelCase = 1;",
      "constNaming",
      { name: "camelCase" },
      "let camelCase = 1;"
    ),
    invalidCode(
      "const mixedCase_name = 1;",
      "constNaming",
      { name: "mixedCase_name" },
      "let mixedCase_name = 1;"
    ),

    // Top level invalid let/var declarations using reserved conventions
    invalidCode("let SCREAMING_SNAKE = 1;", "letVarNaming", {
      name: "SCREAMING_SNAKE",
      kind: "let",
    }),
    invalidCode("var ANOTHER_CONST = 2;", "letVarNaming", {
      name: "ANOTHER_CONST",
      kind: "var",
    }),
    invalidCode("let kFoo = 1;", "letVarNaming", { name: "kFoo", kind: "let" }),
    invalidCode("var kBar = 2;", "letVarNaming", { name: "kBar", kind: "var" }),

    // Inner block invalid const declarations (should autofix to let)
    invalidCode(
      "function foo() { const normalName = 1; }",
      "innerConstNaming",
      { name: "normalName" },
      "function foo() { let normalName = 1; }"
    ),
    invalidCode(
      "if (true) { const camelCase = 1; }",
      "innerConstNaming",
      { name: "camelCase" },
      "if (true) { let camelCase = 1; }"
    ),
    invalidCode(
      "{ const lowerCase = 1; }",
      "innerConstNaming",
      { name: "lowerCase" },
      "{ let lowerCase = 1; }"
    ),

    // Inner block invalid let/var declarations using reserved conventions
    invalidCode(
      "function foo() { let SCREAMING_SNAKE = 1; }",
      "innerLetVarNaming",
      { name: "SCREAMING_SNAKE", kind: "let" }
    ),
    invalidCode("function foo() { var kFoo = 2; }", "innerLetVarNaming", {
      name: "kFoo",
      kind: "var",
    }),
    invalidCode("if (true) { let INNER_CONST = 1; }", "innerLetVarNaming", {
      name: "INNER_CONST",
      kind: "let",
    }),

    // Multiple invalid declarations (should autofix to let)
    invalidCode(
      `const validConst = 1;
       const VALID_CONST = 2;`,
      "constNaming",
      { name: "validConst" },
      `let validConst = 1;
       const VALID_CONST = 2;`
    ),

    // Destructuring: all variables violate -> autofix to let
    {
      code: "const { foo, bar } = obj;",
      output: "let { foo, bar } = obj;",
      errors: [
        { messageId: "constNaming", data: { name: "foo" } },
        { messageId: "constNaming", data: { name: "bar" } },
      ],
    },
    {
      code: "const [first, second] = arr;",
      output: "let [first, second] = arr;",
      errors: [
        { messageId: "constNaming", data: { name: "first" } },
        { messageId: "constNaming", data: { name: "second" } },
      ],
    },
    {
      code: "function test() { const { foo, bar } = obj; }",
      output: "function test() { let { foo, bar } = obj; }",
      errors: [
        { messageId: "innerConstNaming", data: { name: "foo" } },
        { messageId: "innerConstNaming", data: { name: "bar" } },
      ],
    },

    // Destructuring: mixed valid/invalid -> errors but no autofix
    {
      code: "const { foo, FOO } = obj;",
      errors: [{ messageId: "constNaming", data: { name: "foo" } }],
      output: null,
    },
    {
      code: "const { kFoo, invalidName } = obj;",
      errors: [{ messageId: "constNaming", data: { name: "invalidName" } }],
      output: null,
    },
    {
      code: "function test() { const { FOO, bar } = obj; }",
      errors: [{ messageId: "innerConstNaming", data: { name: "bar" } }],
      output: null,
    },
  ],
});
