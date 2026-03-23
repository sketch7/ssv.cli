import chalk from "chalk";
import type { Command } from "commander";
import { execa } from "execa";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { chdir, cwd, platform } from "node:process";
import * as v from "valibot";

import { MassCommandsConfigSchema } from "../config-schema.js";
import type { CommandEntry, MassCommandsConfig } from "../config-schema.js";
import { buildVars, interpolate } from "../interpolate.js";

interface MassExecOptions {
	config: string[];
	root: string;
	shell?: string;
	dryRun: boolean;
}

export function registerMassExecCommand(program: Command): void {
	program
		.command("mass-exec")
		.description("Clone repositories and execute commands defined in config files")
		.requiredOption("-c, --config <file>", "Config file path (repeatable)", collect, [])
		.option("-r, --root <path>", "Root path where repos are cloned into", "./")
		.option("-s, --shell <shell>", "Shell to use for command execution (e.g. powershell, bash)")
		.option("-d, --dry-run", "Print commands without executing them", false)
		.action(async (opts: MassExecOptions) => {
			if (!opts.config.length) {
				console.error(chalk.red("Error: at least one --config file must be specified"));
				process.exit(1);
			}
			await runMassExec(opts);
		});
}

async function runMassExec(opts: MassExecOptions): Promise<void> {
	const rootPath = resolve(opts.root);

	if (!existsSync(rootPath)) {
		console.warn(chalk.yellow(`Execution root '${rootPath}' not found — creating...`));
		mkdirSync(rootPath, { recursive: true });
	}

	console.log(chalk.cyan("------------------------------------------"));
	console.log(chalk.cyan("          SSV Toolz  » mass-exec          "));
	console.log(chalk.cyan("------------------------------------------"));
	console.log(chalk.dim(`Root: ${rootPath}`));

	if (opts.dryRun) {
		console.log(chalk.yellow("[dry-run] No commands will be executed\n"));
	}

	for (const configFile of opts.config) {
		const configPath = resolve(configFile);

		if (!existsSync(configPath)) {
			console.error(chalk.red(`Config file not found: ${configPath}`));
			process.exit(1);
		}

		console.log(chalk.dim(`\nConfig: ${configPath}`));

		let raw: unknown;
		try {
			raw = JSON.parse(readFileSync(configPath, "utf8"));
		} catch (err) {
			console.error(chalk.red(`Failed to parse config: ${configPath}`));
			console.error(err);
			process.exit(1);
		}

		let config: MassCommandsConfig;
		try {
			config = v.parse(MassCommandsConfigSchema, raw);
		} catch (err) {
			if (err instanceof v.ValiError) {
				console.error(chalk.red(`Config validation failed: ${configPath}`));
				for (const issue of err.issues) {
					console.error(chalk.red(`  • ${issue.message} (path: ${issue.path?.map((p: { key: unknown }) => p.key).join(".") ?? "root"})`));
				}
			} else {
				console.error(err);
			}
			process.exit(1);
		}

		const resolvedShell = resolveShell(opts.shell, config.shell);
		await setupAll(config, rootPath, resolvedShell, opts.dryRun);
	}

	console.log(chalk.cyan("\n------------------------------------------"));
	console.log(chalk.cyan("          mass-exec — Complete!           "));
	console.log(chalk.cyan("------------------------------------------\n"));
}

async function setupAll(config: MassCommandsConfig, rootPath: string, shell: string, dryRun: boolean): Promise<void> {
	const total = config.repos.length;

	for (let i = 0; i < total; i++) {
		const repo = config.repos[i];

		console.log();
		console.log(chalk.magenta(`  [${i + 1}/${total}] ${repo.name}`));
		console.log();

		if (!repo.name) {
			console.warn(chalk.yellow("  Repo has an empty name — skipping"));
			continue;
		}

		const repoVars = buildVars(config, repo);
		const prefix = repo.clonePrefix ?? config.clonePrefix ?? "";
		const localName = prefix ? `${prefix.replace(/\.+$/, "")}.${repo.name.replace(/^\.+/, "")}` : repo.name;
		const localPath = resolve(rootPath, localName);

		// Clone if not already present
		const urlTemplate = repo.url ?? config.repoUrlTemplate;
		if (urlTemplate) {
			const url = interpolate(urlTemplate, repoVars);
			if (!existsSync(localPath)) {
				console.log(chalk.cyan("  Cloning repo..."));
				await runCommand(shell, `git clone ${url} ${localName}`, dryRun, rootPath);
			} else {
				console.warn(chalk.yellow("  Already cloned — skipping clone"));
			}
		}

		if (!existsSync(localPath) && !dryRun) {
			console.warn(chalk.yellow(`  Directory '${localName}' does not exist — skipping commands`));
			continue;
		}

		const originalDir = cwd();
		if (!dryRun) {
			chdir(localPath);
		}

		try {
			// Global commands (filtered by skipGlobalCommands)
			const skipSet = new Set(repo.skipGlobalCommands ?? []);
			const globalCmds = (config.globalCommands ?? []).filter(entry => !skipSet.has(Object.keys(entry)[0]));

			if (globalCmds.length) {
				console.log(chalk.cyan("  Running global commands..."));
				await executeCommands(globalCmds, repoVars, shell, dryRun, dryRun ? localPath : undefined);
			}

			// Repo-specific commands
			if (repo.commands?.length) {
				console.log(chalk.cyan("  Running repo commands..."));
				await executeCommands(repo.commands, repoVars, shell, dryRun, dryRun ? localPath : undefined);
			}
		} finally {
			if (!dryRun) {
				chdir(originalDir);
			}
		}
	}
}

async function executeCommands(
	commands: CommandEntry[],
	repoVars: Record<string, string>,
	shell: string,
	dryRun: boolean,
	dryRunCwd?: string,
): Promise<void> {
	for (const entry of commands) {
		const [name, template] = Object.entries(entry)[0];
		const cmd = interpolate(template, repoVars);
		const label = chalk.dim(`    [${name}]`);

		if (dryRun) {
			console.log(`${label} ${chalk.dim("(dry-run)")} ${chalk.white(cmd)}`);
			if (dryRunCwd) {
				console.log(chalk.dim(`           cwd: ${dryRunCwd}`));
			}
			continue;
		}

		console.log(`${label} ${chalk.white(cmd)}`);
		await runCommand(shell, cmd, false);
	}
}

async function runCommand(shell: string, cmd: string, dryRun: boolean, overrideCwd?: string): Promise<void> {
	if (dryRun) {
		console.log(chalk.dim(`  [dry-run] ${cmd}`));
		return;
	}

	const shellFlag = shell.toLowerCase().includes("powershell") || shell.toLowerCase() === "pwsh" ? "-Command" : "-c";

	try {
		await execa(shell, [shellFlag, cmd], {
			stdio: "inherit",
			...(overrideCwd ? { cwd: overrideCwd } : {}),
		});
	} catch (err: unknown) {
		const exitCode = (err as { exitCode?: number }).exitCode;
		console.error(chalk.red(`  Command failed (exit ${exitCode ?? "?"}) : ${cmd}`));
		throw err;
	}
}

/**
 * Shell resolution order:
 *   1. --shell CLI flag
 *   2. config.shell field
 *   3. OS default: powershell on Windows, sh on Unix
 */
function resolveShell(cliShell?: string, configShell?: string): string {
	if (cliShell) return cliShell;
	if (configShell) return configShell;
	return platform === "win32" ? "powershell" : "sh";
}

/** Commander collect helper — appends repeated option values into an array */
function collect(value: string, previous: string[]): string[] {
	return [...previous, value];
}
