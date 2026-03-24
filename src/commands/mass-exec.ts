import chalk from "chalk";
import { Command } from "commander";
import { execa } from "execa";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { resolve } from "node:path";
import { chdir, cwd, platform } from "node:process";
import { createInterface } from "node:readline/promises";
import * as v from "valibot";

import type { ConfigEntry } from "../config-discovery.js";
import { discoverConfigs, resolveNames } from "../config-discovery.js";
import { MassCommandsConfigSchema } from "../config-schema.js";
import type { CommandEntry, MassCommandsConfig, ProjectConfig } from "../config-schema.js";
import { buildVars, interpolate } from "../interpolate.js";
import type { SsvSettings } from "../settings.js";
import { getSettingsPath, readSettings, writeSettings } from "../settings.js";

const SET_KEYS = ["config-root", "ws-root"] as const;
type SetKey = (typeof SET_KEYS)[number];

interface RunOptions {
	project?: string;
	root?: string;
	shell?: string;
	dryRun: boolean;
}

export function registerMassExecCommand(program: Command): void {
	const massExec = program.command("mass-exec").description("Clone repositories and execute commands defined in config files");

	massExec
		.command("set")
		.description(`Persist a setting. Keys: ${SET_KEYS.join(" | ")}`)
		.argument("<key>", `Setting name: ${SET_KEYS.join(" | ")}`)
		.argument("<value>", "Value to store")
		.action((key: string, value: string) => {
			if (!(SET_KEYS as readonly string[]).includes(key)) {
				console.error(chalk.red(`Unknown key "${key}". Valid keys: ${SET_KEYS.join(", ")}`));
				process.exit(1);
			}
			const settings = readSettings();
			const absValue = resolve(value);
			if ((key as SetKey) === "config-root") {
				if (!existsSync(absValue)) {
					console.error(chalk.red(`Directory not found: ${absValue}`));
					process.exit(1);
				}
				writeSettings({ ...settings, configRoot: absValue });
				console.log(chalk.cyan(`✔ config-root set to: ${absValue}`));
			} else {
				writeSettings({ ...settings, wsRoot: absValue });
				console.log(chalk.cyan(`✔ ws-root set to: ${absValue}`));
			}
		});

	massExec
		.command("setup")
		.description("Interactive setup: configure ws-root and config-root")
		.action(async () => {
			const settings = readSettings();
			const rl = createInterface({ input: process.stdin, output: process.stdout });
			try {
				const defaultWsRoot = settings.wsRoot ?? homedir();
				const wsRootInput = (await rl.question(chalk.cyan(`Workspace root [${defaultWsRoot}]: `))).trim();
				const wsRoot = wsRootInput || defaultWsRoot;

				const defaultConfigRoot = settings.configRoot ?? "";
				const configRootPrompt = defaultConfigRoot ? chalk.cyan(`Config root [${defaultConfigRoot}]: `) : chalk.cyan("Config root: ");
				const configRootInput = (await rl.question(configRootPrompt)).trim();
				const configRoot = configRootInput || defaultConfigRoot;

				const newSettings: SsvSettings = { ...settings, wsRoot: resolve(wsRoot) };
				if (configRoot) newSettings.configRoot = resolve(configRoot);
				writeSettings(newSettings);

				console.log(chalk.cyan(`\n✔ Settings saved to: ${getSettingsPath()}`));
				console.log(chalk.dim(`  ws-root:     ${resolve(wsRoot)}`));
				if (configRoot) console.log(chalk.dim(`  config-root: ${resolve(configRoot)}`));
			} finally {
				rl.close();
			}
		});

	massExec
		.command("list")
		.description("List all available mass-exec configs in the registered directory")
		.action(() => {
			const settings = readSettings();
			if (!settings.configRoot) {
				console.error(chalk.red("No config root registered. Run: ssv mass-exec set config-root <path>"));
				process.exit(1);
			}
			const configs = discoverConfigs(settings.configRoot);
			if (!configs.length) {
				console.log(chalk.yellow(`No config files found in: ${settings.configRoot}`));
				return;
			}
			console.log(`${chalk.cyan("mass-exec configs")}  ${chalk.dim(settings.configRoot)}\n`);
			for (const entry of configs) {
				console.log(`  ${chalk.cyan(entry.name)}  ${chalk.dim(entry.filePath)}`);
			}
		});

	massExec.addCommand(
		new Command("run")
			.description("Run one or more mass-exec config(s) by name, prefix, or 'all'")
			.argument("<names...>", "Config name(s): exact (ssv/tools), prefix (ssv), or 'all'")
			.option("--project <filter>", "Only run projects whose name contains this string (case-insensitive)")
			.option("-r, --root <path>", "Override root path where repos are cloned (ignores ws-root setting)")
			.option("-s, --shell <shell>", "Shell to use for command execution (e.g. powershell, bash)")
			.option("-d, --dry-run", "Print commands without executing them", false)
			.action(async (names: string[], opts: RunOptions) => {
				const settings = readSettings();
				if (!settings.configRoot) {
					console.error(chalk.red("No config root registered. Run: ssv mass-exec set config-root <path>"));
					process.exit(1);
				}
				const discovered = discoverConfigs(settings.configRoot);
				const { resolved, unresolved } = resolveNames(names, discovered);

				if (unresolved.length) {
					console.error(chalk.red(`Could not resolve config(s): ${unresolved.map(n => `"${n}"`).join(", ")}`));
					console.error(chalk.dim("Run `ssv mass-exec list` to see available configs."));
					process.exit(1);
				}

				await runMassExec(resolved, opts, settings);
			}),
		{ isDefault: true },
	);
}

function resolveBaseRoot(cliRoot?: string, globalWsRoot?: string): string {
	if (cliRoot) return resolve(cliRoot);
	if (globalWsRoot) return resolve(globalWsRoot);
	return resolve("./");
}

async function runMassExec(entries: ConfigEntry[], opts: RunOptions, settings: SsvSettings): Promise<void> {
	const baseRoot = resolveBaseRoot(opts.root, settings.wsRoot);

	if (!existsSync(baseRoot)) {
		console.warn(chalk.yellow(`Execution root '${baseRoot}' not found — creating...`));
		mkdirSync(baseRoot, { recursive: true });
	}

	console.log(chalk.cyan("------------------------------------------"));
	console.log(chalk.cyan("          SSV Toolz  » mass-exec          "));
	console.log(chalk.cyan("------------------------------------------"));
	console.log(chalk.dim(`Root: ${baseRoot}`));

	if (opts.dryRun) {
		console.log(chalk.yellow("[dry-run] No commands will be executed\n"));
	}

	for (const entry of entries) {
		console.log(`\n${chalk.dim("Config:")} ${chalk.cyan(entry.name)}  ${chalk.dim(entry.filePath)}`);

		let raw: unknown;
		try {
			raw = JSON.parse(readFileSync(entry.filePath, "utf8"));
		} catch (err) {
			console.error(chalk.red(`Failed to parse config: ${entry.filePath}`));
			console.error(err);
			process.exit(1);
		}

		let config: MassCommandsConfig;
		try {
			config = v.parse(MassCommandsConfigSchema, raw);
		} catch (err) {
			if (err instanceof v.ValiError) {
				console.error(chalk.red(`Config validation failed: ${entry.filePath}`));
				for (const issue of err.issues) {
					console.error(chalk.red(`  • ${issue.message} (path: ${issue.path?.map((p: { key: unknown }) => p.key).join(".") ?? "root"})`));
				}
			} else {
				console.error(err);
			}
			process.exit(1);
		}

		if (opts.project) {
			const filter = opts.project.toLowerCase();
			config = { ...config, projects: config.projects.filter(r => r.name.toLowerCase().includes(filter)) };
			if (!config.projects.length) {
				console.warn(chalk.yellow(`  --project filter "${opts.project}" matched no projects — skipping config`));
				continue;
			}
		}

		const resolvedShell = resolveShell(opts.shell, config.shell);
		// Per-config wsRoot override (supports {wsRoot} token pointing to the global setting)
		const rootPath = config.wsRoot ? resolve(interpolate(config.wsRoot, { wsRoot: baseRoot })) : baseRoot;
		await setupAll(config, rootPath, resolvedShell, opts.dryRun);
	}

	console.log(chalk.cyan("\n------------------------------------------"));
	console.log(chalk.cyan("          mass-exec — Complete!           "));
	console.log(chalk.cyan("------------------------------------------\n"));
}

async function setupAll(config: MassCommandsConfig, rootPath: string, shell: string, dryRun: boolean): Promise<void> {
	const total = config.projects.length;

	for (let i = 0; i < total; i++) {
		const project: ProjectConfig = config.projects[i];

		console.log();
		console.log(chalk.magenta(`  [${i + 1}/${total}] ${project.name}`));
		console.log();

		if (!project.name) {
			console.warn(chalk.yellow("  Project has an empty name — skipping"));
			continue;
		}

		const projectVars = buildVars(config, project);
		const prefix = project.clonePrefix ?? config.clonePrefix ?? "";
		const localName = prefix ? `${prefix.replace(/\.+$/, "")}.${project.name.replace(/^\.+/, "")}` : project.name;
		const localPath = resolve(rootPath, localName);

		// Clone if not already present
		const urlTemplate = project.url ?? config.cloneUrlTemplate;
		if (urlTemplate) {
			const url = interpolate(urlTemplate, projectVars);
			if (!existsSync(localPath)) {
				console.log(chalk.cyan("  Cloning project..."));
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
			const skipSet = new Set(project.skipGlobalCommands ?? []);
			const globalCmds = (config.globalCommands ?? []).filter(entry => !skipSet.has(Object.keys(entry)[0]));

			if (globalCmds.length) {
				console.log(chalk.cyan("  Running global commands..."));
				await executeCommands(globalCmds, projectVars, shell, dryRun, dryRun ? localPath : undefined);
			}

			// Project-specific commands
			if (project.commands?.length) {
				console.log(chalk.cyan("  Running project commands..."));
				await executeCommands(project.commands, projectVars, shell, dryRun, dryRun ? localPath : undefined);
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
