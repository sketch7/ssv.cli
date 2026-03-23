#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

import { Command } from "commander";

import { registerMassExecCommand } from "./commands/mass-exec.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(resolve(__dirname, "../package.json"), "utf8")) as { version: string };

const program = new Command();

program.name("ssv-toolz")
	.description("@ssv developer tooling CLI")
	.version(pkg.version, "-v, --version");

registerMassExecCommand(program);

await program.parseAsync(process.argv);
