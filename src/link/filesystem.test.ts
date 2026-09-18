import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { BACKUP_SUFFIX } from "./config";
import { assertPathInsideRoot, isLinkedToSource, linkTarget, restoreTarget } from "./filesystem";

const tempDirectories: string[] = [];

function createTempDirectory(): string {
	const directory = mkdtempSync(join(tmpdir(), "ssv-link-filesystem-"));
	tempDirectories.push(directory);
	return directory;
}

function createDirectory(path: string, marker: string): void {
	mkdirSync(path, { recursive: true });
	writeFileSync(join(path, "marker.txt"), marker, "utf8");
}

afterEach(() => {
	for (const directory of tempDirectories.splice(0)) {
		rmSync(directory, { force: true, recursive: true });
	}
});

describe("assertPathInsideRoot", () => {
	it("rejects targets outside the root including sibling-prefix paths", () => {
		const parent = createTempDirectory();
		const root = join(parent, "repo");
		mkdirSync(root);

		expect(() => assertPathInsideRoot(root, join(parent, "repository", "package"))).toThrow(/outside consumer root/);
		expect(() => assertPathInsideRoot(root, root)).toThrow(/outside consumer root/);
	});
});

describe("linkTarget", () => {
	it("backs up an installed target and links it to local source", () => {
		const consumerRoot = createTempDirectory();
		const sourceDir = createTempDirectory();
		const target = join(consumerRoot, "node_modules", "@scope", "package");
		createDirectory(sourceDir, "source");
		createDirectory(target, "registry");

		expect(linkTarget({ consumerRoot, sourceDir, target })).toBe("linked");
		expect(isLinkedToSource(target, sourceDir)).toBe(true);
		expect(readFileSync(join(`${target}${BACKUP_SUFFIX}`, "marker.txt"), "utf8")).toBe("registry");
		expect(linkTarget({ consumerRoot, sourceDir, target })).toBe("already-linked");
	});

	it("refuses to overwrite an existing backup conflict", () => {
		const consumerRoot = createTempDirectory();
		const sourceDir = createTempDirectory();
		const target = join(consumerRoot, "node_modules", "package");
		createDirectory(sourceDir, "source");
		createDirectory(target, "registry");
		createDirectory(`${target}${BACKUP_SUFFIX}`, "older-registry");

		expect(linkTarget({ consumerRoot, sourceDir, target })).toBe("conflict");
		expect(readFileSync(join(target, "marker.txt"), "utf8")).toBe("registry");
	});

	it("restores the target immediately when link creation fails", () => {
		const consumerRoot = createTempDirectory();
		const sourceDir = createTempDirectory();
		const target = join(consumerRoot, "node_modules", "package");
		createDirectory(sourceDir, "source");
		createDirectory(target, "registry");

		expect(() =>
			linkTarget(
				{ consumerRoot, sourceDir, target },
				{
					createLink: () => {
						throw new Error("simulated link failure");
					},
				},
			),
		).toThrow(/simulated link failure/);
		expect(readFileSync(join(target, "marker.txt"), "utf8")).toBe("registry");
		expect(existsSync(`${target}${BACKUP_SUFFIX}`)).toBe(false);
	});
});

describe("restoreTarget", () => {
	it("restores a backup only when the target is owned by SSV", () => {
		const consumerRoot = createTempDirectory();
		const sourceDir = createTempDirectory();
		const target = join(consumerRoot, "node_modules", "package");
		createDirectory(sourceDir, "source");
		createDirectory(target, "registry");
		linkTarget({ consumerRoot, sourceDir, target });

		expect(restoreTarget({ consumerRoot, sourceDir, target })).toBe("restored");
		expect(readFileSync(join(target, "marker.txt"), "utf8")).toBe("registry");
	});

	it("leaves unrelated links and their backups untouched", () => {
		const consumerRoot = createTempDirectory();
		const expectedSource = createTempDirectory();
		const otherSource = createTempDirectory();
		const target = join(consumerRoot, "node_modules", "package");
		createDirectory(expectedSource, "expected");
		createDirectory(otherSource, "other");
		createDirectory(`${target}${BACKUP_SUFFIX}`, "registry");
		mkdirSync(dirname(target), { recursive: true });
		symlinkSync(otherSource, target, process.platform === "win32" ? "junction" : "dir");

		expect(restoreTarget({ consumerRoot, sourceDir: expectedSource, target })).toBe("not-owned");
		expect(isLinkedToSource(target, otherSource)).toBe(true);
		expect(existsSync(`${target}${BACKUP_SUFFIX}`)).toBe(true);
	});
});
