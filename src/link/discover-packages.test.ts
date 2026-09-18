import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { discoverPackages } from "./discover-packages";

const tempDirectories: string[] = [];

function createTempDirectory(): string {
	const directory = mkdtempSync(join(tmpdir(), "ssv-link-packages-"));
	tempDirectories.push(directory);
	return directory;
}

function writePackage(directory: string, name: string): void {
	mkdirSync(directory, { recursive: true });
	writeFileSync(join(directory, "package.json"), JSON.stringify({ name }), "utf8");
}

afterEach(() => {
	for (const directory of tempDirectories.splice(0)) {
		rmSync(directory, { force: true, recursive: true });
	}
});

describe("discoverPackages", () => {
	it("finds descendant packages but excludes the source root package", () => {
		const rootDir = createTempDirectory();
		writePackage(rootDir, "root-workspace");
		writePackage(join(rootDir, "packages", "alpha"), "@scope/alpha");
		writePackage(join(rootDir, "libs", "beta"), "plain-beta");

		expect([...discoverPackages(rootDir).entries()]).toEqual([
			["plain-beta", { name: "plain-beta", rootDir, sourceDir: join(rootDir, "libs", "beta") }],
			["@scope/alpha", { name: "@scope/alpha", rootDir, sourceDir: join(rootDir, "packages", "alpha") }],
		]);
	});

	it("stops descending at package boundaries and skips generated directories", () => {
		const rootDir = createTempDirectory();
		writePackage(join(rootDir, "packages", "outer"), "@scope/outer");
		writePackage(join(rootDir, "packages", "outer", "nested"), "@scope/nested");
		writePackage(join(rootDir, "node_modules", "ignored"), "@scope/ignored");
		writePackage(join(rootDir, "dist", "generated"), "@scope/generated");

		expect([...discoverPackages(rootDir).keys()]).toEqual(["@scope/outer"]);
	});

	it("ignores malformed manifests and directory symlinks", () => {
		const rootDir = createTempDirectory();
		const external = createTempDirectory();
		mkdirSync(join(rootDir, "broken"), { recursive: true });
		writeFileSync(join(rootDir, "broken", "package.json"), "not-json", "utf8");
		writePackage(join(external, "linked-package"), "@scope/external");
		symlinkSync(external, join(rootDir, "linked"), process.platform === "win32" ? "junction" : "dir");

		expect(discoverPackages(rootDir).size).toBe(0);
	});
});
