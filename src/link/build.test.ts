import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { detectBuildStrategy, runBuild } from "./build";

const tempDirectories: string[] = [];

function createTempDirectory(): string {
	const directory = mkdtempSync(join(tmpdir(), "ssv-link-build-"));
	tempDirectories.push(directory);
	return directory;
}

afterEach(() => {
	for (const directory of tempDirectories.splice(0)) {
		rmSync(directory, { force: true, recursive: true });
	}
});

describe("detectBuildStrategy", () => {
	it("prefers Nx over Turbo and package scripts", () => {
		const rootDir = createTempDirectory();
		writeFileSync(join(rootDir, "nx.json"), "{}", "utf8");
		writeFileSync(join(rootDir, "turbo.json"), "{}", "utf8");
		writeFileSync(join(rootDir, "package.json"), JSON.stringify({ scripts: { build: "tsdown" } }), "utf8");

		expect(detectBuildStrategy(rootDir, "build")).toBe("nx");
	});

	it("uses Turbo when Nx is absent", () => {
		const rootDir = createTempDirectory();
		writeFileSync(join(rootDir, "turbo.json"), "{}", "utf8");

		expect(detectBuildStrategy(rootDir, "build")).toBe("turbo");
	});

	it("uses a matching package script and otherwise returns none", () => {
		const rootDir = createTempDirectory();
		writeFileSync(join(rootDir, "package.json"), JSON.stringify({ scripts: { compile: "tsdown" } }), "utf8");

		expect(detectBuildStrategy(rootDir, "compile")).toBe("pnpm");
		expect(detectBuildStrategy(rootDir, "build")).toBe("none");
	});
});

describe("runBuild", () => {
	it.each([
		["nx", ["nx", "run-many", "-t", "compile"]],
		["turbo", ["turbo", "run", "compile"]],
		["pnpm", ["run", "compile"]],
	] as const)("runs the exact pnpm command for %s", async (strategy, expectedArgs) => {
		const calls: unknown[] = [];
		const result = await runBuild({ rootDir: "S:/source", strategy, target: "compile" }, async (command, args, options) => {
			calls.push({ args, command, options });
		});

		expect(result).toBe(true);
		expect(calls).toEqual([{ args: expectedArgs, command: "pnpm", options: { cwd: "S:/source", stdio: "inherit" } }]);
	});

	it("does not invoke a process when no build strategy exists", async () => {
		let invoked = false;
		const result = await runBuild({ rootDir: "S:/source", strategy: "none", target: "build" }, async () => {
			invoked = true;
		});

		expect(result).toBe(false);
		expect(invoked).toBe(false);
	});
});
