import * as v from "valibot";
import { describe, expect, it } from "vitest";

import { LinkConfigSchema, LinkStateSchema } from "./schema";

describe("LinkConfigSchema", () => {
	it("normalizes empty package lists and applies build defaults", () => {
		expect(
			v.parse(LinkConfigSchema, {
				links: { "../source": { packages: null } },
			}),
		).toEqual({
			links: {
				"../source": {
					build: "build",
					output: "dist",
					packages: [],
				},
			},
		});
	});

	it.each(["@scope/package", "plain-package", "@scope.name/package_name"])("accepts npm package name %s", packageName => {
		expect(() =>
			v.parse(LinkConfigSchema, {
				links: { source: { packages: [packageName] } },
			}),
		).not.toThrow();
	});

	it.each(["@missing-slash", "UpperCase", "@scope/"])("rejects invalid npm package name %s", packageName => {
		expect(() =>
			v.parse(LinkConfigSchema, {
				links: { source: { packages: [packageName] } },
			}),
		).toThrow();
	});

	it("rejects unknown configuration fields", () => {
		expect(() => v.parse(LinkConfigSchema, { links: {}, unexpected: true })).toThrow();
	});
});

describe("LinkStateSchema", () => {
	it("validates a versioned state entry", () => {
		const state = {
			packages: {
				"@scope/package": {
					linkedAt: "2026-08-05T17:00:00.000Z",
					rootDir: "S:\\git\\source",
					sourceDir: "S:\\git\\source\\packages\\package",
					targets: [
						{
							backupPath: "S:\\git\\consumer\\node_modules\\@scope\\package.ssv-registry-backup",
							path: "S:\\git\\consumer\\node_modules\\@scope\\package",
						},
					],
				},
			},
			version: 1,
		};

		expect(v.parse(LinkStateSchema, state)).toEqual(state);
	});

	it("rejects unsupported state versions", () => {
		expect(() => v.parse(LinkStateSchema, { packages: {}, version: 2 })).toThrow();
	});
});
