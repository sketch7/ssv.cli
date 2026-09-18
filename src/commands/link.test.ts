import { Command } from "commander";
import { resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import type { ReconcileOptions, ReconcileResult } from "../link/reconcile";
import registerLinkCommand from "./link";
import type { LinkCommandDependencies } from "./link";

function createResult(): ReconcileResult {
	return {
		execution: {
			failures: [],
			linked: 0,
			restored: 0,
			state: { packages: {}, version: 1 },
			success: true,
			warnings: [],
		},
		plan: { actions: [] },
	};
}

afterEach(() => {
	process.exitCode = 0;
});

describe("registerLinkCommand", () => {
	it("registers reconcile options and the init subcommand", () => {
		const program = new Command();
		registerLinkCommand(program, {
			initialize: () => ({ configFile: "config", gitignoreFile: "ignore", overwritten: false }),
			reconcile: async () => createResult(),
		});

		const link = program.commands.find(command => command.name() === "link");
		expect(link?.helpInformation()).toContain("--root <path>");
		expect(link?.helpInformation()).toContain("--config <path>");
		expect(link?.helpInformation()).toContain("--no-build");
		expect(link?.helpInformation()).toContain("--dry-run");
		expect(link?.commands.map(command => command.name())).toEqual(["init"]);
	});

	it("forwards resolved reconciliation options", async () => {
		const calls: ReconcileOptions[] = [];
		const dependencies: LinkCommandDependencies = {
			initialize: () => ({ configFile: "config", gitignoreFile: "ignore", overwritten: false }),
			reconcile: async options => {
				calls.push(options);
				return createResult();
			},
		};
		const program = new Command();
		registerLinkCommand(program, dependencies);

		await program.parseAsync(["node", "ssv", "link", "--root", "S:/consumer", "--config", "custom.yaml", "--no-build", "--dry-run"]);

		expect(calls).toEqual([
			{
				configFile: resolve("S:/consumer", "custom.yaml"),
				consumerRoot: resolve("S:/consumer"),
				dryRun: true,
				noBuild: true,
			},
		]);
	});

	it("allows automatic builds when --no-build is omitted", async () => {
		const calls: ReconcileOptions[] = [];
		const program = new Command();
		registerLinkCommand(program, {
			initialize: () => ({ configFile: "config", gitignoreFile: "ignore", overwritten: false }),
			reconcile: async options => {
				calls.push(options);
				return createResult();
			},
		});

		await program.parseAsync(["node", "ssv", "link"]);

		expect(calls[0]?.noBuild).toBe(false);
	});

	it("initializes the selected repository and forwards force", async () => {
		const calls: unknown[] = [];
		const program = new Command();
		registerLinkCommand(program, {
			initialize: options => {
				calls.push(options);
				return { configFile: "config", gitignoreFile: "ignore", overwritten: false };
			},
			reconcile: async () => createResult(),
		});

		await program.parseAsync(["node", "ssv", "link", "init", "--root", "S:/consumer", "--force"]);

		expect(calls).toEqual([{ force: true, rootDir: resolve("S:/consumer") }]);
	});
});
