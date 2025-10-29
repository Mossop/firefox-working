/**
 * @file Requires const to follow the correct naming conventions
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

const SNAKE_REGEX = /^[A-Z0-9](?:[A-Z0-9_]*[A-Z0-9])?$/;

function isScreamingSnakeCase(name) {
  return SNAKE_REGEX.test(name);
}

function startsWithK(name) {
  return (
    name.length >= 2 && name[0] === "k" && name[1] >= "A" && name[1] <= "Z"
  );
}

function startsWithG(name) {
  return (
    name.length >= 2 && name[0] === "g" && name[1] >= "A" && name[1] <= "Z"
  );
}

function isTopLevel(node) {
  return node.parent.type === "Program";
}

function isArrowFunction(init) {
  return init && init.type === "ArrowFunctionExpression";
}

function isDestructuringFromCiOrNsI(node) {
  if (node.id.type !== "ObjectPattern") {
    return false;
  }

  if (!node.init) {
    return false;
  }

  if (
    node.init.type === "MemberExpression" &&
    node.init.object.type === "Identifier" &&
    node.init.object.name === "Ci"
  ) {
    return true;
  }

  if (node.init.type === "Identifier" && node.init.name.startsWith("nsI")) {
    return true;
  }

  return false;
}

function extractIdentifiers(pattern, identifiers = []) {
  if (pattern.type === "Identifier") {
    identifiers.push(pattern);
  } else if (pattern.type === "ObjectPattern") {
    for (let prop of pattern.properties) {
      if (prop.type === "RestElement") {
        extractIdentifiers(prop.argument, identifiers);
      } else {
        extractIdentifiers(prop.value, identifiers);
      }
    }
  } else if (pattern.type === "ArrayPattern") {
    for (let element of pattern.elements) {
      if (element) {
        extractIdentifiers(element, identifiers);
      }
    }
  } else if (pattern.type === "RestElement") {
    extractIdentifiers(pattern.argument, identifiers);
  } else if (pattern.type === "AssignmentPattern") {
    extractIdentifiers(pattern.left, identifiers);
  }
  return identifiers;
}

export default {
  meta: {
    docs: {
      url: "https://firefox-source-docs.mozilla.org/code-quality/lint/linters/eslint-plugin-mozilla/rules/require-snake-case-const.html",
    },
    fixable: "code",
    messages: {
      constNaming:
        "const '{{name}}' at top level must be SCREAMING_SNAKE_CASE, start with 'k' followed by a capital letter, or be named 'lazy'",
      letVarNaming:
        "{{kind}} '{{name}}' must not use SCREAMING_SNAKE_CASE or 'k' followed by a capital letter (reserved for const)",
      innerConstNaming:
        "const '{{name}}' in inner block must be SCREAMING_SNAKE_CASE or start with 'k' followed by a capital letter",
      innerLetVarNaming:
        "{{kind}} '{{name}}' must not use SCREAMING_SNAKE_CASE or 'k' followed by a capital letter (reserved for const)",
    },
    schema: [],
    type: "suggestion",
  },

  create(context) {
    return {
      VariableDeclaration(node) {
        let topLevel = isTopLevel(node);

        for (let declarator of node.declarations) {
          let identifiers;

          if (declarator.id.type === "Identifier") {
            identifiers = [declarator.id];
          } else {
            if (
              node.kind === "const" &&
              !topLevel &&
              isDestructuringFromCiOrNsI(declarator)
            ) {
              continue;
            }
            identifiers = extractIdentifiers(declarator.id);
          }

          let violations = [];
          let isArrowFunc = isArrowFunction(declarator.init);

          for (let identifier of identifiers) {
            let name = identifier.name;
            let isSnakeCase = isScreamingSnakeCase(name);
            let isKPrefixed = startsWithK(name);
            let isGPrefixed = startsWithG(name);
            let isLazy = name === "lazy";

            let violates = false;
            let messageId;

            if (topLevel) {
              if (node.kind === "const") {
                if (!isSnakeCase && !isKPrefixed && !isGPrefixed && !isLazy) {
                  violates = true;
                  messageId = "constNaming";
                }
              } else if (isSnakeCase || isKPrefixed) {
                violates = true;
                messageId = "letVarNaming";
              }
            } else if (node.kind === "const") {
              if (!isSnakeCase && !isKPrefixed && !isArrowFunc) {
                violates = true;
                messageId = "innerConstNaming";
              }
            } else if (isSnakeCase || isKPrefixed) {
              violates = true;
              messageId = "innerLetVarNaming";
            }

            if (violates) {
              violations.push({ identifier, name, messageId });
            }
          }

          if (violations.length) {
            let allViolate = violations.length === identifiers.length;
            let canAutofix =
              allViolate &&
              node.kind === "const" &&
              (violations[0].messageId === "constNaming" ||
                violations[0].messageId === "innerConstNaming");

            for (let violation of violations) {
              context.report({
                node: violation.identifier,
                messageId: violation.messageId,
                data: {
                  name: violation.name,
                  kind: node.kind,
                },
                fix: canAutofix
                  ? function (fixer) {
                      let sourceCode = context.getSourceCode();
                      let constToken = sourceCode.getFirstToken(node);
                      return fixer.replaceText(constToken, "let");
                    }
                  : undefined,
              });
            }
          }
        }
      },
    };
  },
};
