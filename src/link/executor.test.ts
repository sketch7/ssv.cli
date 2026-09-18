import { describe, expect, it } from "vitest";

import { executeLinkPlan } from "./executor";
import type { ExecutorDependencies } from "./executor";
import type { LinkPlan } from "./planner";
import type { LinkState } from "./schema";

const EMPTY_STATE: LinkState = { packages: {}, version: 1 };

function createDependencies(overrides: Partial<ExecutorDependencies> = {}): ExecutorDependencies {
	return {
		link: () => "linked",
		now: () => "2026-08-05T17:00:00.000Z",
		outputExists: () => true,
		restore: () => "restored",
		runBuild: async () => true,
		writeState: () => null,
		...overrides,
	};
}

describe("executeLinkPlan", () => {
	it("performs no effects during dry run", async () => {
		const plan: LinkPlan = {
			actions: [
				{ buildTarget: "build", kind: "build", rootDir: "S:/source" },
				{
					kind: "link",
					name: "@scope/package",
					outputPath: "S:/source/package/dist",
					rootDir: "S:/source",
					sourceDir: "S:/source/package",
					target: "S:/consumer/node_modules/@scope/package",
				},
			],
		};
		const fail = (): never => {
			throw new Error("dry run invoked a dependency");
		};

		const result = await executeLinkPlan(
			plan,
			{ consumerRoot: "S:/consumer", dryRun: true, state: EMPTY_STATE, stateFile: "S:/consumer/state.json" },
			createDependencies({ link: fail, outputExists: fail, restore: fail, runBuild: fail, writeState: fail }),
		);

		expect(result).toEqual({ failures: [], linked: 0, restored: 0, state: EMPTY_STATE, success: true, warnings: [] });
	});

	it("builds, rechecks output, links, and writes successful state", async () => {
		const events: string[] = [];
		const plan: LinkPlan = {
			actions: [
				{ buildTarget: "build", kind: "build", rootDir: "S:/source" },
				{
					kind: "link",
					name: "@scope/package",
					outputPath: "S:/source/package/dist",
					rootDir: "S:/source",
					sourceDir: "S:/source/package",
					target: "S:/consumer/node_modules/@scope/package",
				},
			],
		};
		const writtenStates: LinkState[] = [];
		const dependencies = createDependencies({
			link: () => {
				events.push("link");
				return "linked";
			},
			outputExists: () => {
				events.push("output");
				return true;
			},
			runBuild: async () => {
				events.push("build");
				return true;
			},
			writeState: (_path, state) => {
				events.push("state");
				writtenStates.push(state);
			},
		});

		const result = await executeLinkPlan(
			plan,
			{ consumerRoot: "S:/consumer", dryRun: false, state: EMPTY_STATE, stateFile: "S:/consumer/state.json" },
			dependencies,
		);

		expect(events).toEqual(["build", "output", "link", "state"]);
		expect(result.success).toBe(true);
		expect(result.linked).toBe(1);
		expect(writtenStates[0]?.packages["@scope/package"]?.targets).toEqual([
			{
				backupPath: "S:/consumer/node_modules/@scope/package.ssv-registry-backup",
				path: "S:/consumer/node_modules/@scope/package",
			},
		]);
	});

	it("records a failed build and does not attempt dependent links", async () => {
		let linkInvoked = false;
		const plan: LinkPlan = {
			actions: [
				{ buildTarget: "build", kind: "build", rootDir: "S:/source" },
				{
					kind: "link",
					name: "@scope/package",
					outputPath: "S:/source/package/dist",
					rootDir: "S:/source",
					sourceDir: "S:/source/package",
					target: "S:/consumer/node_modules/@scope/package",
				},
			],
		};

		const result = await executeLinkPlan(
			plan,
			{ consumerRoot: "S:/consumer", dryRun: false, state: EMPTY_STATE, stateFile: "S:/consumer/state.json" },
			createDependencies({
				link: () => {
					linkInvoked = true;
					return "linked";
				},
				runBuild: async () => false,
			}),
		);

		expect(result.success).toBe(false);
		expect(result.failures).toEqual(["Build failed for S:/source (target: build)"]);
		expect(linkInvoked).toBe(false);
	});

	it("retains state for restorations that are not owned", async () => {
		const state: LinkState = {
			packages: {
				"@scope/package": {
					linkedAt: "2026-08-05T17:00:00.000Z",
					rootDir: "S:/source",
					sourceDir: "S:/source/package",
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
		const plan: LinkPlan = {
			actions: [
				{
					kind: "restore",
					name: "@scope/package",
					rootDir: "S:/source",
					sourceDir: "S:/source/package",
					target: "S:/consumer/node_modules/@scope/package",
				},
			],
		};

		const result = await executeLinkPlan(
			plan,
			{ consumerRoot: "S:/consumer", dryRun: false, state, stateFile: "S:/consumer/state.json" },
			createDependencies({ restore: () => "not-owned" }),
		);

		expect(result.success).toBe(false);
		expect(result.state).toEqual(state);
	});
});
