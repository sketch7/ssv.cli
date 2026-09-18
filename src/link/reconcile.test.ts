import { existsSync, lstatSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { DEFAULT_CONFIG_FILE, DEFAULT_STATE_FILE } from "./config";
import { reconcileLinks } from "./reconcile";

const tempDirectories: string[] = [];

function createFixture(): { consumerRoot: string; sourceRoot: string; target: string } {
	const parent = mkdtempSync(join(tmpdir(), "ssv-link-reconcile-"));
	tempDirectories.push(parent);
	const consumerRoot = join(parent, "consumer");
	const sourceRoot = join(parent, "source");
	const sourcePackage = join(sourceRoot, "packages", "library");
	const target = join(consumerRoot, "node_modules", "@scope", "library");
	mkdirSync(join(sourcePackage, "dist"), { recursive: true });
	mkdirSync(target, { recursive: true });
	writeFileSync(join(sourcePackage, "package.json"), JSON.stringify({ name: "@scope/library" }), "utf8");
	writeFileSync(join(target, "package.json"), JSON.stringify({ name: "@scope/library", version: "1.0.0" }), "utf8");
	writeFileSync(
		join(consumerRoot, DEFAULT_CONFIG_FILE),
		`links:\n  ${relative(consumerRoot, sourceRoot).replaceAll("\\", "/")}:\n    packages:\n      - "@scope/library"\n`,
		"utf8",
	);
	return { consumerRoot, sourceRoot, target };
}

afterEach(() => {
	for (const directory of tempDirectories.splice(0)) {
		rmSync(directory, { force: true, recursive: true });
	}
});

describe("reconcileLinks", () => {
	it("creates a deterministic dry-run plan without mutations", async () => {
		const { consumerRoot, target } = createFixture();

		const result = await reconcileLinks({ consumerRoot, dryRun: true, noBuild: false });

		expect(result.plan.actions.map(action => action.kind)).toEqual(["link"]);
		expect(lstatSync(target).isSymbolicLink()).toBe(false);
		expect(existsSync(join(consumerRoot, DEFAULT_STATE_FILE))).toBe(false);
	});

	it("links discovered consumers and persists successful state", async () => {
		const { consumerRoot, target } = createFixture();

		const result = await reconcileLinks({ consumerRoot, dryRun: false, noBuild: false });

		expect(result.execution.success).toBe(true);
		expect(result.execution.linked).toBe(1);
		expect(lstatSync(target).isSymbolicLink()).toBe(true);
		expect(existsSync(join(consumerRoot, DEFAULT_STATE_FILE))).toBe(true);
	});

	it("turns missing roots and packages into actionable warnings", async () => {
		const { consumerRoot } = createFixture();
		writeFileSync(join(consumerRoot, DEFAULT_CONFIG_FILE), "links:\n  ../missing:\n    packages: ['@scope/unknown']\n", "utf8");

		const result = await reconcileLinks({ consumerRoot, dryRun: true, noBuild: false });

		expect(result.plan.actions).toEqual([
			{
				kind: "warn",
				message: expect.stringContaining("Source root does not exist"),
			},
		]);
	});
});
