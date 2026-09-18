import { describe, expect, it } from "vitest";

import { createLinkPlan } from "./planner";
import type { DesiredPackage } from "./planner";
import type { LinkState } from "./schema";

const EMPTY_STATE: LinkState = { packages: {}, version: 1 };

function createDesiredPackage(overrides: Partial<DesiredPackage> = {}): DesiredPackage {
	return {
		buildTarget: "build",
		name: "@scope/package",
		outputExists: true,
		outputPath: "S:/source/package/dist",
		rootDir: "S:/source",
		sourceDir: "S:/source/package",
		targets: [{ path: "S:/consumer/node_modules/@scope/package", status: "linkable" }],
		...overrides,
	};
}

describe("createLinkPlan", () => {
	it("deduplicates builds and orders them before dependent links", () => {
		const desired = [
			createDesiredPackage({ name: "@scope/zeta", outputExists: false, sourceDir: "S:/source/zeta" }),
			createDesiredPackage({ name: "@scope/alpha", outputExists: false, sourceDir: "S:/source/alpha" }),
		];

		const plan = createLinkPlan({ desired, noBuild: false, state: EMPTY_STATE, warnings: [] });

		expect(plan.actions.map(action => `${action.kind}:${"name" in action ? action.name : action.rootDir}`)).toEqual([
			"build:S:/source",
			"link:@scope/alpha",
			"link:@scope/zeta",
		]);
	});

	it("warns and skips packages with missing output when builds are disabled", () => {
		const plan = createLinkPlan({
			desired: [createDesiredPackage({ outputExists: false })],
			noBuild: true,
			state: EMPTY_STATE,
			warnings: [],
		});

		expect(plan.actions).toEqual([
			{
				kind: "warn",
				message: "@scope/package has no output at S:/source/package/dist; skipped because --no-build is set",
			},
		]);
	});

	it("restores packages removed from configuration before linking desired packages", () => {
		const state: LinkState = {
			packages: {
				"@scope/removed": {
					linkedAt: "2026-08-05T17:00:00.000Z",
					rootDir: "S:/old-source",
					sourceDir: "S:/old-source/removed",
					targets: [
						{
							backupPath: "S:/consumer/node_modules/@scope/removed.ssv-registry-backup",
							path: "S:/consumer/node_modules/@scope/removed",
						},
					],
				},
			},
			version: 1,
		};

		const plan = createLinkPlan({ desired: [createDesiredPackage()], noBuild: false, state, warnings: [] });

		expect(plan.actions.map(action => action.kind)).toEqual(["restore", "link"]);
	});

	it("restores an old source before relinking the same package from a new source", () => {
		const state: LinkState = {
			packages: {
				"@scope/package": {
					linkedAt: "2026-08-05T17:00:00.000Z",
					rootDir: "S:/old-source",
					sourceDir: "S:/old-source/package",
					targets: [
						{
							backupPath: "S:/consumer/node_modules/@scope/package.ssv-registry-backup",
							path: "S:/consumer/node_modules/@scope/package",
						},
					],
				},
			},
			version: 1,
		};
		const desired = [
			createDesiredPackage({
				rootDir: "S:/new-source",
				sourceDir: "S:/new-source/package",
				targets: [{ path: "S:/consumer/node_modules/@scope/package", status: "conflict" }],
			}),
		];

		const plan = createLinkPlan({ desired, noBuild: false, state, warnings: [] });

		expect(plan.actions.map(action => action.kind)).toEqual(["restore", "link"]);
	});

	it("classifies already-linked, backup-only, conflicting, and missing targets", () => {
		const plan = createLinkPlan({
			desired: [
				createDesiredPackage({
					targets: [
						{ path: "S:/consumer/already", status: "already-linked" },
						{ path: "S:/consumer/backup", status: "backup-only" },
						{ path: "S:/consumer/conflict", status: "conflict" },
						{ path: "S:/consumer/missing", status: "missing" },
					],
				}),
			],
			noBuild: false,
			state: EMPTY_STATE,
			warnings: [],
		});

		expect(plan.actions.map(action => action.kind)).toEqual(["keep", "link", "warn", "warn"]);
	});

	it("sorts discovery warnings and package actions deterministically", () => {
		const plan = createLinkPlan({
			desired: [createDesiredPackage({ name: "@scope/zeta" }), createDesiredPackage({ name: "@scope/alpha" })],
			noBuild: false,
			state: EMPTY_STATE,
			warnings: ["Z warning", "A warning"],
		});

		expect(
			plan.actions.map(action => {
				if (action.kind === "warn") {
					return action.message;
				}
				return action.kind === "build" ? action.rootDir : action.name;
			}),
		).toEqual(["A warning", "Z warning", "@scope/alpha", "@scope/zeta"]);
	});
});
