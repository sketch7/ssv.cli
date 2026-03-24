import { Command } from "commander";
import { consola } from "consola";
import { colors } from "consola/utils";
import { execa } from "execa";
import { Listr } from "listr2";
import type { DefaultRenderer, ListrTask, ListrTaskWrapper, SimpleRenderer } from "listr2";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { resolve } from "node:path";
import { platform } from "node:process";
import { createInterface } from "node:readline/promises";
import * as v from "valibot";
import { parse as parseYaml } from "yaml";

import type { ConfigEntry } from "../config-discovery.js";
import { discoverConfigs, resolveNames } from "../config-discovery.js";
import { MassCommandsConfigSchema } from "../config-schema.js";
import type { MassCommandsConfig, ProjectConfig, Step } from "../config-schema.js";
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
	concurrency: number;
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
				consola.error(`Unknown key "${key}". Valid keys: ${SET_KEYS.join(", ")}`);
				process.exit(1);
			}
			const settings = readSettings();
			const absValue = resolve(value);
			if ((key as SetKey) === "config-root") {
				if (!existsSync(absValue)) {
					consola.error(`Directory not found: ${absValue}`);
					process.exit(1);
				}
				writeSettings({ ...settings, configRoot: absValue });
				consola.success(`config-root set to: ${colors.cyan(absValue)}`);
			} else {
				writeSettings({ ...settings, wsRoot: absValue });
				consola.success(`ws-root set to: ${colors.cyan(absValue)}`);
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
				const wsRootInput = (await rl.question(colors.cyan(`Workspace root [${defaultWsRoot}]: `))).trim();
				const wsRoot = wsRootInput || defaultWsRoot;

				const defaultConfigRoot = settings.configRoot ?? "";
				const configRootPrompt = defaultConfigRoot ? colors.cyan(`Config root [${defaultConfigRoot}]: `) : colors.cyan("Config root: ");
				const configRootInput = (await rl.question(configRootPrompt)).trim();
				const configRoot = configRootInput || defaultConfigRoot;

				const newSettings: SsvSettings = { ...settings, wsRoot: resolve(wsRoot) };
				if (configRoot) newSettings.configRoot = resolve(configRoot);
				writeSettings(newSettings);

				consola.success(`Settings saved to: ${colors.dim(getSettingsPath())}`);
				consola.info(`  ws-root:     ${colors.dim(resolve(wsRoot))}`);
				if (configRoot) consola.info(`  config-root: ${colors.dim(resolve(configRoot))}`);
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
				consola.error("No config root registered. Run: ssv mass-exec set config-root <path>");
				process.exit(1);
			}
			const configs = discoverConfigs(settings.configRoot);
			if (!configs.length) {
				consola.warn(`No config files found in: ${settings.configRoot}`);
				return;
			}
			consola.info(`${colors.cyan("mass-exec configs")}  ${colors.dim(settings.configRoot)}\n`);
			for (const entry of configs) {
				consola.log(`  ${colors.cyan(entry.name)}  ${colors.dim(entry.filePath)}`);
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
			.option("-c, --concurrency <n>", "Max projects to process in parallel", "5")
			.action(async (names: string[], opts: RunOptions) => {
				const settings = readSettings();
				if (!settings.configRoot) {
					consola.error("No config root registered. Run: ssv mass-exec set config-root <path>");
					process.exit(1);
				}
				const discovered = discoverConfigs(settings.configRoot);
				const { resolved, unresolved } = resolveNames(names, discovered);

				if (unresolved.length) {
					consola.error(`Could not resolve config(s): ${unresolved.map(n => `"${n}"`).join(", ")}`);
					consola.info("Run `ssv mass-exec list` to see available configs.");
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

// ---------------------------------------------------------------------------
// Normalized step types
// ---------------------------------------------------------------------------

interface NormalizedStep {
	name: string;
	run: string;
	needs: string[];
	parallel: boolean;
}

function normalizeStep(step: Step): NormalizedStep {
	return { name: step.name, run: step.run, needs: step.needs ?? [], parallel: step.parallel ?? false };
}

/**
 * Build execution waves based on step position and the `parallel` flag.
 * Consecutive steps with `parallel: true` are grouped into one wave and run concurrently.
 * Non-parallel steps form singleton waves and run sequentially.
 * `needs` references are validated — warns on unknown names.
 */
function buildStepWaves(steps: NormalizedStep[]): NormalizedStep[][] {
	const names = new Set(steps.map(s => s.name));
	for (const step of steps) {
		for (const dep of step.needs) {
			if (!names.has(dep)) {
				consola.warn(`Step "${step.name}" needs unknown step "${dep}" — skipping dependency`);
			}
		}
	}

	const waves: NormalizedStep[][] = [];
	let i = 0;
	while (i < steps.length) {
		if (steps[i].parallel) {
			const wave: NormalizedStep[] = [];
			while (i < steps.length && steps[i].parallel) {
				wave.push(steps[i]);
				i++;
			}
			waves.push(wave);
		} else {
			waves.push([steps[i]]);
			i++;
		}
	}
	return waves;
}

// ---------------------------------------------------------------------------
// Main runner
// ---------------------------------------------------------------------------

async function runMassExec(entries: ConfigEntry[], opts: RunOptions, settings: SsvSettings): Promise<void> {
	const baseRoot = resolveBaseRoot(opts.root, settings.wsRoot);

	if (!existsSync(baseRoot)) {
		consola.warn(`Execution root '${baseRoot}' not found — creating...`);
		mkdirSync(baseRoot, { recursive: true });
	}

	consola.info(`${colors.cyan("SSV Toolz")}  ${colors.dim("»")} mass-exec`);
	consola.info(`${colors.dim("Root:")} ${baseRoot}`);

	if (opts.dryRun) {
		consola.warn("[dry-run] No commands will be executed");
	}

	for (const entry of entries) {
		consola.info(`${colors.dim("Config:")} ${colors.cyan(entry.name)}  ${colors.dim(entry.filePath)}`);

		let raw: unknown;
		try {
			raw = parseYaml(readFileSync(entry.filePath, "utf8"));
		} catch (err) {
			consola.error(`Failed to parse config: ${entry.filePath}`);
			consola.error(String(err));
			process.exit(1);
		}

		let config: MassCommandsConfig;
		try {
			config = v.parse(MassCommandsConfigSchema, raw);
		} catch (err) {
			if (err instanceof v.ValiError) {
				consola.error(`Config validation failed: ${entry.filePath}`);
				for (const issue of err.issues) {
					consola.error(`  • ${issue.message} (path: ${issue.path?.map((p: { key: unknown }) => p.key).join(".") ?? "root"})`);
				}
			} else {
				consola.error(String(err));
			}
			process.exit(1);
		}

		if (opts.project) {
			const filter = opts.project.toLowerCase();
			config = { ...config, projects: config.projects.filter(r => r.name.toLowerCase().includes(filter)) };
			if (!config.projects.length) {
				consola.warn(`--project filter "${opts.project}" matched no projects — skipping config`);
				continue;
			}
		}

		const resolvedShell = resolveShell(opts.shell, config.shell);
		// Per-config wsRoot override (supports {wsRoot} token pointing to the global setting)
		const rootPath = config.wsRoot ? resolve(interpolate(config.wsRoot, { wsRoot: baseRoot })) : baseRoot;

		// Concurrency: CLI flag > config > default 5
		const concurrency = opts.concurrency ?? config.concurrency ?? 5;

		await setupAll(config, rootPath, resolvedShell, opts.dryRun, concurrency);
	}

	consola.success("mass-exec — Complete!");
}

// ---------------------------------------------------------------------------
// Listr2-based project runner
// ---------------------------------------------------------------------------

type Ctx = Record<string, never>;

/**
 * Convert a list of waves into listr2 task definitions.
 * Single-step waves render as a plain task; multi-step waves render as a nested concurrent group.
 */
function buildWaveTasks(
	waves: NormalizedStep[][],
	shell: string,
	dryRun: boolean,
	localPath: string,
): ListrTask<Ctx, typeof DefaultRenderer, typeof SimpleRenderer>[] {
	const tasks: ListrTask<Ctx, typeof DefaultRenderer, typeof SimpleRenderer>[] = [];
	for (const wave of waves) {
		if (wave.length === 1) {
			const step = wave[0];
			tasks.push({
				title: `${colors.dim(`[${step.name}]`)} ${colors.white(step.run)}`,
				task: async (_c, stepTask) => {
					stepTask.output = dryRun ? `${colors.yellow("(dry-run)")} ${colors.white(step.run)}` : colors.dim(step.run);
					if (!dryRun) await runCommand(shell, step.run, localPath);
				},
			});
		} else {
			// Parallel wave — nested concurrent listr
			tasks.push({
				title: wave.map(s => colors.dim(`[${s.name}]`)).join(" "),
				task: (_c, waveTask) =>
					waveTask.newListr(
						wave.map(step => ({
							title: `${colors.dim(`[${step.name}]`)} ${colors.white(step.run)}`,
							task: async (_c2: Ctx, stepTask: ListrTaskWrapper<Ctx, typeof DefaultRenderer, typeof SimpleRenderer>) => {
								stepTask.output = dryRun ? `${colors.yellow("(dry-run)")} ${colors.white(step.run)}` : colors.dim(step.run);
								if (!dryRun) await runCommand(shell, step.run, localPath);
							},
						})),
						{ concurrent: true, exitOnError: true },
					),
			});
		}
	}
	return tasks;
}

/** Detect if we are in a non-interactive / CI environment. */
function isVerboseRenderer(): boolean {
	return (consola.level ?? 3) >= 4;
}

async function setupAll(config: MassCommandsConfig, rootPath: string, shell: string, dryRun: boolean, concurrency: number): Promise<void> {
	const projectTasks = config.projects.map((project: ProjectConfig) => ({
		title: project.name,
		task: (_ctx: Ctx, task: ListrTaskWrapper<Ctx, typeof DefaultRenderer, typeof SimpleRenderer>) => {
			if (!project.name) {
				task.skip("Project has an empty name");
				return;
			}

			const projectVars = buildVars(config, project);
			const prefix = project.clonePrefix ?? config.clonePrefix ?? "";
			const localName = prefix ? `${prefix.replace(/\.+$/, "")}.${project.name.replace(/^\.+/, "")}` : project.name;
			const localPath = resolve(rootPath, localName);

			return task.newListr(
				[
					// ---- Clone ----
					{
						title: "Clone",
						skip: () => {
							const urlTemplate = project.url ?? config.cloneUrlTemplate;
							if (!urlTemplate) return "No clone URL";
							if (existsSync(localPath)) return "Already cloned";
							return false;
						},
						task: async (_, subTask) => {
							const urlTemplate = project.url ?? config.cloneUrlTemplate;
							if (!urlTemplate) return;
							const url = interpolate(urlTemplate, projectVars);
							const cmd = `git clone ${url} ${localName}`;
							subTask.output = dryRun ? `${colors.yellow("(dry-run)")} ${colors.white(cmd)}` : colors.dim(cmd);
							if (!dryRun) {
								await runCommand(shell, cmd, rootPath);
							}
						},
					},
					// ---- Check dir exists ----
					{
						title: "Verify directory",
						skip: () => dryRun || existsSync(localPath),
						task: (_, subTask) => {
							subTask.skip(`Directory '${localName}' does not exist — skipping steps`);
						},
					},
					// ---- Global steps ----
					{
						title: "Global steps",
						skip: () => {
							const skipSet = new Set(project.skipGlobalSteps ?? []);
							const globalSteps = (config.globalSteps ?? []).filter(s => !skipSet.has(s.name));
							return globalSteps.length === 0 ? "No global steps" : false;
						},
						task: async (_ctx2, subTask) => {
							const skipSet = new Set(project.skipGlobalSteps ?? []);
							const globalSteps = (config.globalSteps ?? [])
								.map(normalizeStep)
								.filter(s => !skipSet.has(s.name))
								.map(s => ({ ...s, run: interpolate(s.run, projectVars) }));

							const waves = buildStepWaves(globalSteps);
							return subTask.newListr(buildWaveTasks(waves, shell, dryRun, localPath), { concurrent: false, exitOnError: true });
						},
					},
					// ---- Project steps ----
					{
						title: "Project steps",
						skip: () => (!project.steps?.length ? "No project steps" : false),
						task: async (_, subTask) => {
							const steps = (project.steps ?? []).map(normalizeStep).map(s => ({ ...s, run: interpolate(s.run, projectVars) }));

							const waves = buildStepWaves(steps);
							return subTask.newListr(buildWaveTasks(waves, shell, dryRun, localPath), { concurrent: false, exitOnError: true });
						},
					},
				],
				{ concurrent: false, exitOnError: false },
			);
		},
	}));

	const renderer = isVerboseRenderer() ? "verbose" : process.stdout.isTTY ? "default" : "simple";

	const listr = new Listr(projectTasks, {
		concurrent: concurrency,
		exitOnError: false,
		renderer,
		rendererOptions: renderer === "default" ? { collapseSubtasks: false } : {},
	});

	await listr.run();

	// Summarize any failures
	const failures = listr.errors;
	if (failures.length > 0) {
		consola.warn(`${failures.length} project(s) encountered errors:`);
		for (const err of failures) {
			consola.error(err.message ?? String(err));
		}
	}
}

// ---------------------------------------------------------------------------
// Command execution
// ---------------------------------------------------------------------------

async function runCommand(shell: string, cmd: string, cwd: string): Promise<void> {
	const shellFlag = shell.toLowerCase().includes("powershell") || shell.toLowerCase() === "pwsh" ? "-Command" : "-c";

	try {
		await execa(shell, [shellFlag, cmd], { cwd, stdio: "pipe" });
	} catch (err: unknown) {
		const exitCode = (err as { exitCode?: number }).exitCode;
		const stderr = (err as { stderr?: string }).stderr ?? "";
		throw new Error(`Command failed (exit ${exitCode ?? "?"}): ${cmd}${stderr ? `\n${stderr}` : ""}`, { cause: err });
	}
}

// ---------------------------------------------------------------------------
// Shell resolution
// ---------------------------------------------------------------------------

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
