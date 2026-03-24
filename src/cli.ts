#!/usr/bin/env node
import { Command } from "commander";
import { consola } from "consola";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import updateNotifier from "update-notifier";

import { registerMassExecCommand } from "./commands/mass-exec.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(resolve(__dirname, "../package.json"), "utf8")) as { name: string; version: string };

// Non-blocking update check — shows notification on next run if an update is available
updateNotifier({ pkg }).notify();

const program = new Command();

program
	.name("ssv")
	.description("@ssv developer tooling CLI")
	.version(pkg.version, "-v, --version")
	.option("--log-level <level>", "Log verbosity: silent|error|warn|info|debug|verbose", "info")
	.hook("preAction", cmd => {
		const level = (cmd.opts() as { logLevel: string }).logLevel;
		const levelMap: Record<string, number> = { silent: -999, error: 0, warn: 1, info: 3, debug: 4, verbose: 5 };
		if (level in levelMap) {
			consola.level = levelMap[level];
		} else {
			consola.warn(`Unknown log level "${level}" — using "info"`);
			consola.level = 3;
		}
	});

registerMassExecCommand(program);

await program.parseAsync(process.argv);
