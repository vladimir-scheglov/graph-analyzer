/**
 * Monaco Monarch-токенайзер для Domain RQL.
 * Регистрируется через monaco.languages.setMonarchTokensProvider.
 */
import type { MonarchLanguage, IStandaloneThemeData } from "./monaco-types";

export const RQL_LANGUAGE_ID = "domain-rql";

export const rqlMonarch: MonarchLanguage = {
  defaultToken: "",
  tokenPostfix: ".rql",
  ignoreCase: true,

  keywords: [
    "SELECT",
    "FROM",
    "WHERE",
    "GROUP",
    "BY",
    "HAVING",
    "ORDER",
    "LIMIT",
    "OFFSET",
    "JOIN",
    "INNER",
    "LEFT",
    "RIGHT",
    "FULL",
    "ON",
    "ENRICH",
    "AS",
    "IN",
    "NOT",
    "IS",
    "NULL",
    "LIKE",
    "ILIKE",
    "BETWEEN",
    "AND",
    "OR",
    "ASC",
    "DESC",
  ],

  operators: ["=", "!=", "<>", "<", "<=", ">", ">=", "+", "-", "*", "/", "%"],

  symbols: /[=><!~?:&|+\-*/^%]+/,

  tokenizer: {
    root: [
      // @-алиасы: @doc, @CurrentUser.id, @row.field
      [/@[A-Za-z_][\w]*(\.[A-Za-z_][\w]*)?/, "variable.alias"],

      // строки в одинарных кавычках
      [/'([^'\\]|\\.)*'/, "string"],
      // строки в двойных кавычках
      [/"([^"\\]|\\.)*"/, "string"],

      // числа
      [/\d+(\.\d+)?/, "number"],

      // идентификатор: если keyword — keyword, иначе — identifier
      [
        /[A-Za-z_][\w]*/,
        {
          cases: {
            "@keywords": "keyword",
            "@default": "identifier",
          },
        },
      ],

      // операторы / символы
      [
        /@symbols/,
        { cases: { "@operators": "operator", "@default": "operator" } },
      ],

      // скобки
      [/[{}()\[\]]/, "@brackets"],

      // запятая / точка с запятой
      [/[,;]/, "delimiter"],

      // пробелы
      [/[ \t\r\n]+/, "white"],

      // комментарии (маловероятно, но на случай /* */)
      [/\/\*/, "comment", "@comment"],
      [/--.*$/, "comment"],
    ],
    comment: [
      [/[^/*]+/, "comment"],
      [/\*\//, "comment", "@pop"],
      [/[/*]/, "comment"],
    ],
  },
};

/** Тема для Monaco — на CSS-переменных. */
export function buildRqlTheme(
  dark: boolean,
): IStandaloneThemeData {
  return {
    base: dark ? "vs-dark" : "vs",
    inherit: true,
    rules: [
      { token: "variable.alias", foreground: dark ? "c4b5fd" : "7c3aed" },
      {
        token: "keyword",
        foreground: dark ? "93c5fd" : "1d4ed8",
        fontStyle: "bold",
      },
      { token: "identifier", foreground: dark ? "e2e8f0" : "1e293b" },
      { token: "string", foreground: dark ? "86efac" : "047857" },
      { token: "number", foreground: dark ? "fbbf24" : "b45309" },
      { token: "operator", foreground: dark ? "cbd5e1" : "475569" },
    ],
    colors: {
      "editor.background": dark ? "#0d1424" : "#ffffff",
      "editor.foreground": dark ? "#e2e8f0" : "#1e293b",
    },
  };
}

export const RQL_THEME_DARK = "rql-dark";
export const RQL_THEME_LIGHT = "rql-light";
