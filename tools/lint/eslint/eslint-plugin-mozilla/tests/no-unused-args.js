/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

// ------------------------------------------------------------------------------
// Requirements
// ------------------------------------------------------------------------------

var rule = require("../lib/rules/no-unused-args");
var RuleTester = require("eslint").RuleTester;

const ruleTester = new RuleTester({ parserOptions: { ecmaVersion: "latest" } });

// ------------------------------------------------------------------------------
// Tests
// ------------------------------------------------------------------------------

function unusedArgs(varNames) {
  return varNames.map(varName => ({
    messageId: "unusedArg",
    data: { varName },
    type: "Identifier",
  }));
}

function unreadArgs(varNames) {
  return varNames.map(varName => ({
    messageId: "unreadArg",
    data: { varName },
    type: "Identifier",
  }));
}

ruleTester.run("no-unused-vars", rule, {
  valid: [
    "function test() {}",
    "() => {}",
    "(ab) => ab",
    "ab => ab",
    "(ab, bc) => bc",
    "(ab, bc) => { return bc; }",
    "new Clz(() => true)",
    "new Clz((a) => a)",
    "new Clz(a => a)",
    "new Clz((a, b) => b)",
    "let obj = { value(a) { return a; } }",
    "let obj = { value(a, b) { return b; } }",
    "let obj = { value: function(a) { return a; } }",
    "let obj = { value: function(a, b) { return b; } }",
    "class Clz { foo(a) { return a } }",
    "class Clz { foo(a, b) { return b } }",
    "([, b]) => b",
    "({ a, b }) => ([a, b])",
    "(...test) => test.foo",
    "function test(foo = null, bar) { return bar; }",
  ],
  invalid: [
    {
      code: "function test(foo) {}",
      output: "function test() {}",
      errors: unusedArgs(["foo"]),
    },
    {
      code: "function test(foo, bar) { return foo; }",
      output: "function test(foo) { return foo; }",
      errors: unusedArgs(["bar"]),
    },
    {
      code: "function test(foo, bar, baz) { return bar; }",
      output: "function test(foo, bar) { return bar; }",
      errors: unusedArgs(["baz"]),
    },
    {
      code: "function test(foo, bar, baz) { return foo; }",
      // The rule tester only runs a single pass which means only a single
      // fix is applied.
      output: "function test(foo, baz) { return foo; }",
      errors: unusedArgs(["bar", "baz"]),
    },
    {
      code: "(a) => true",
      output: "() => true",
      errors: unusedArgs(["a"]),
    },
    {
      code: "a => true",
      output: "() => true",
      errors: unusedArgs(["a"]),
    },
    {
      code: "(a, b) => true",
      // The rule tester only runs a single pass which means only a single
      // fix is applied.
      output: "( b) => true",
      errors: unusedArgs(["a", "b"]),
    },
    {
      code: "(a, b) => a",
      output: "(a) => a",
      errors: unusedArgs(["b"]),
    },
    {
      code: "new Clz(a => true)",
      output: "new Clz(() => true)",
      errors: unusedArgs(["a"]),
    },
    {
      code: "new Clz((a, b) => true)",
      // The rule tester only runs a single pass which means only a single
      // fix is applied.
      output: "new Clz(( b) => true)",
      errors: unusedArgs(["a", "b"]),
    },
    {
      code: "let obj = { value(a) { } }",
      output: "let obj = { value() { } }",
      errors: unusedArgs(["a"]),
    },
    {
      code: "let obj = { value(a, b) { return a; } }",
      output: "let obj = { value(a) { return a; } }",
      errors: unusedArgs(["b"]),
    },
    {
      code: "let obj = { value: function(a) { } }",
      output: "let obj = { value: function() { } }",
      errors: unusedArgs(["a"]),
    },
    {
      code: "let obj = { value: function(a, b) { return a; } }",
      output: "let obj = { value: function(a) { return a; } }",
      errors: unusedArgs(["b"]),
    },
    {
      code: "class Clz { foo(a) { } }",
      output: "class Clz { foo() { } }",
      errors: unusedArgs(["a"]),
    },
    {
      code: "class Clz { foo(a, b) { return a } }",
      output: "class Clz { foo(a) { return a } }",
      errors: unusedArgs(["b"]),
    },
    {
      code: "([a, b]) => a",
      output: "([a]) => a",
      errors: unusedArgs(["b"]),
    },
    {
      code: "([a, b]) => b",
      output: "([, b]) => b",
      errors: unusedArgs(["a"]),
    },
    {
      code: "({ a, b }) => a",
      output: "({ a}) => a",
      errors: unusedArgs(["b"]),
    },
    {
      code: "({ a, b }) => b",
      output: "({ b }) => b",
      errors: unusedArgs(["a"]),
    },
    {
      code: "({ a, b, c }) => b",
      output: "({ b}) => b",
      errors: unusedArgs(["a", "c"]),
    },
    {
      code: "(a, ...test) => a",
      output: "(a) => a",
      errors: unusedArgs(["test"]),
    },
    {
      code: "(...test) => true",
      output: "() => true",
      errors: unusedArgs(["test"]),
    },
    {
      code: "function test({\ntest,\n}) {}",
      output: "function test() {}",
      errors: unusedArgs(["test"]),
    },
    {
      code: "function test({ a, b, }) { return a; }",
      output: "function test({ a }) { return a; }",
      errors: unusedArgs(["b"]),
    },
    {
      code: "function test({ a, }) { }",
      output: "function test() { }",
      errors: unusedArgs(["a"]),
    },
    {
      code: "function test(a, {b}) { return a; }",
      output: "function test(a) { return a; }",
      errors: unusedArgs(["b"]),
    },
    {
      code: "function test(a, [b]) { return a; }",
      output: "function test(a) { return a; }",
      errors: unusedArgs(["b"]),
    },
    {
      code: "function test(a = 5) { }",
      output: "function test() { }",
      errors: unusedArgs(["a"]),
    },
    {
      code: "function test({a = 5}) { }",
      output: "function test() { }",
      errors: unusedArgs(["a"]),
    },
    {
      code: "function test([a = 5]) { }",
      output: "function test() { }",
      errors: unusedArgs(["a"]),
    },
    {
      code: "function test({ a }, b) { return b }",
      output: "function test({}, b) { return b }",
      errors: unusedArgs(["a"]),
    },
    {
      code: "function test(a, { b: { c = 5 }}) { return a }",
      output: "function test(a) { return a }",
      errors: unusedArgs(["c"]),
    },
    {
      code: "function test(a, { b: { c }}) { return a }",
      output: "function test(a) { return a }",
      errors: unusedArgs(["c"]),
    },
    {
      code: "function test([,,t]) { }",
      output: "function test([,]) { }",
      errors: unusedArgs(["t"]),
    },
    {
      code: "function test(foo) { foo = 5 }",
      output: null,
      errors: unreadArgs(["foo"]),
    },
  ],
});
