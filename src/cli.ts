#!/usr/bin/env node
import { Command } from "commander";
import { consola } from "consola";
import updateNotifier from "update-notifier";

import pkg from "../package.json" with { type: "json" };
import registerLinkCommand from "./commands/link";
import registerMassExecCommand from "./commands/mass-exec";

// Non-blocking update check — shows notification on next run if an update is available
updateNotifier({ pkg }).notify();

const program = new Command();

program
	.name("ssv")
	.description("@ssv developer tooling CLI")
	.version(pkg.version, "-v, --version")
	.option("--log-level <level>", "Log verbosity: silent|error|warn|info|debug|verbose", "info")
	.hook("preAction", cmd => {
		const level = cmd.opts().logLevel;
		const levelMap: Record<string, number> = { silent: -999, error: 0, warn: 1, info: 3, debug: 4, verbose: 5 };
		if (level in levelMap) {
			consola.level = levelMap[level];
		} else {
			consola.warn(`Unknown log level "${level}" — using "info"`);
			consola.level = 3;
		}
	});

registerMassExecCommand(program);
registerLinkCommand(program);

await program.parseAsync(process.argv);
