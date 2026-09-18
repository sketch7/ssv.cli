import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		clearMocks: true,
		coverage: {
			exclude: ["**/*.test.ts"],
			include: ["src/link/**/*.ts"],
			provider: "v8",
			reporter: ["text", "html"],
		},
		environment: "node",
		restoreMocks: true,
	},
});
