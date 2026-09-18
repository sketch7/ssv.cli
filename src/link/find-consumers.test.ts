import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { findConsumerTargets } from "./find-consumers";

const tempDirectories: string[] = [];

function createTempDirectory(): string {
	const directory = mkdtempSync(join(tmpdir(), "ssv-link-consumers-"));
	tempDirectories.push(directory);
	return directory;
}

function createTarget(path: string): void {
	mkdirSync(path, { recursive: true });
	writeFileSync(join(path, "package.json"), "{}", "utf8");
}

afterEach(() => {
	for (const directory of tempDirectories.splice(0)) {
		rmSync(directory, { force: true, recursive: true });
	}
});

describe("findConsumerTargets", () => {
	it("finds ordinary, workspace, canonical pnpm, and transitive pnpm targets", () => {
		const rootDir = createTempDirectory();
		const targets = [
			join(rootDir, "node_modules", "@scope", "package"),
			join(rootDir, "apps", "demo", "node_modules", "@scope", "package"),
			join(rootDir, "node_modules", ".pnpm", "@scope+package@1.0.0", "node_modules", "@scope", "package"),
			join(rootDir, "node_modules", ".pnpm", "consumer@2.0.0", "node_modules", "@scope", "package"),
		];
		for (const target of targets) {
			createTarget(target);
		}

		expect(findConsumerTargets(rootDir, "@scope/package")).toEqual([...targets].sort());
	});

	it("finds targets that currently have only an SSV backup", () => {
		const rootDir = createTempDirectory();
		const target = join(rootDir, "node_modules", "plain-package");
		createTarget(`${target}.ssv-registry-backup`);

		expect(findConsumerTargets(rootDir, "plain-package")).toEqual([target]);
	});

	it("excludes source roots inside the consumer repository", () => {
		const rootDir = createTempDirectory();
		const sourceRoot = join(rootDir, "local-source");
		createTarget(join(sourceRoot, "node_modules", "@scope", "package"));
		createTarget(join(rootDir, "node_modules", "@scope", "package"));

		expect(findConsumerTargets(rootDir, "@scope/package", [sourceRoot])).toEqual([join(rootDir, "node_modules", "@scope", "package")]);
	});

	it("rejects malformed package names before scanning", () => {
		expect(() => findConsumerTargets(createTempDirectory(), "@scope/package/extra")).toThrow(/package name/);
	});
});
