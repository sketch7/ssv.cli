import { defineConfig } from "oxlint";

export default defineConfig({
	// todo: add import
	plugins: ["typescript"],
	env: {
		node: true,
	},
	categories: {
		correctness: "error",
		suspicious: "warn",
		style: "warn",
		pedantic: "off",
		restriction: "error",
	},
	rules: {
		// https://oxc.rs/docs/guide/usage/linter/rules.html
		curly: ["error", "all", "consistent"],
		"prefer-const": "error",
		"prefer-template": "error",
		"sort-keys": "off",
		"func-style": ["error", "declaration", { allowArrowFunctions: true }],
		eqeqeq: "error",
		"no-var": "error",
		"no-console": "off",
		"no-process-exit": "off",
		"no-unused-vars": "off",
		"no-ternary": "off",
		"no-nested-ternary": "off",
		"no-continue": "off",
		"no-plusplus": "off",
		"no-magic-numbers": "off",
		"no-use-before-define": "off",
		"init-declarations": "off",
		"max-statements": ["warn", { max: 40 }],
		"id-length": "off",
		"capitalized-comments": "off",
		"sort-imports": [
			"warn",
			{
				ignoreCase: true,
				ignoreDeclarationSort: true,
				ignoreMemberSort: true,
				memberSyntaxSortOrder: ["none", "all", "multiple", "single"],
			},
		],
		// "import/extensions": ["error", "always"],
		"typescript/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
		"typescript/consistent-type-imports": ["error", { prefer: "type-imports" }],
		"typescript/no-explicit-any": "warn",
		"typescript/explicit-function-return-type": [
			"warn",
			{
				allowExpressions: true,
			},
		],
	},
});
