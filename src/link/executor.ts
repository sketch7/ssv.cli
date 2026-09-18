import { existsSync } from "node:fs";

import { detectBuildStrategy, runBuild } from "./build";
import { BACKUP_SUFFIX, writeLinkState } from "./config";
import { linkTarget, restoreTarget } from "./filesystem";
import type { LinkResult, RestoreResult, TargetInput } from "./filesystem";
import type { BuildAction, LinkAction, LinkPlan, RestoreAction } from "./planner";
import type { LinkState } from "./schema";

export interface ExecuteOptions {
	consumerRoot: string;
	dryRun: boolean;
	state: LinkState;
	stateFile: string;
}

export interface ExecutorDependencies {
	link: (input: TargetInput) => LinkResult;
	now: () => string;
	outputExists: (path: string) => boolean;
	restore: (input: TargetInput) => RestoreResult;
	runBuild: (action: BuildAction) => Promise<boolean>;
	writeState: (path: string, state: LinkState) => void;
}

export interface ExecutionResult {
	failures: string[];
	linked: number;
	restored: number;
	state: LinkState;
	success: boolean;
	warnings: string[];
}

interface ActionContext {
	consumerRoot: string;
	dependencies: ExecutorDependencies;
	failures: string[];
}

export async function executeLinkPlan(
	plan: LinkPlan,
	options: ExecuteOptions,
	dependencies: ExecutorDependencies = createDefaultDependencies(),
): Promise<ExecutionResult> {
	if (options.dryRun) {
		return { failures: [], linked: 0, restored: 0, state: options.state, success: true, warnings: [] };
	}

	let state = structuredClone(options.state);
	const failures: string[] = [];
	const warnings: string[] = [];
	const failedRoots = new Set<string>();
	let linked = 0;
	let restored = 0;

	for (const action of plan.actions) {
		if (action.kind === "warn") {
			warnings.push(action.message);
		} else if (action.kind === "build") {
			// oxlint-disable-next-line no-await-in-loop -- actions must execute in plan order for safe recovery
			if (!(await dependencies.runBuild(action))) {
				failedRoots.add(action.rootDir);
				failures.push(`Build failed for ${action.rootDir} (target: ${action.buildTarget})`);
			}
		} else if (action.kind === "restore") {
			const result = executeRestore(action, { consumerRoot: options.consumerRoot, dependencies, failures });
			if (result === "restored") {
				restored += 1;
				state = removeStateTarget(state, action.name, action.target);
			} else if (result === "missing-backup") {
				state = removeStateTarget(state, action.name, action.target);
			}
		} else if (action.kind === "keep") {
			state = upsertStateTarget(state, action, dependencies.now());
		} else if (!failedRoots.has(action.rootDir)) {
			const result = executeLink(action, { consumerRoot: options.consumerRoot, dependencies, failures });
			if (result === "linked" || result === "already-linked") {
				if (result === "linked") {
					linked += 1;
				}
				state = upsertStateTarget(state, action, dependencies.now());
			}
		}
	}

	try {
		dependencies.writeState(options.stateFile, state);
	} catch (error) {
		failures.push(`Failed to write state ${options.stateFile}: ${getErrorMessage(error)}`);
	}

	return { failures, linked, restored, state, success: failures.length === 0, warnings };
}

function executeRestore(action: RestoreAction, context: ActionContext): RestoreResult | null {
	try {
		const result = context.dependencies.restore({
			consumerRoot: context.consumerRoot,
			sourceDir: action.sourceDir,
			target: action.target,
		});
		if (result === "not-owned") {
			context.failures.push(`Refused to restore unowned target ${action.target}`);
		} else if (result === "missing-backup") {
			context.failures.push(`No backup found while restoring ${action.target}; run pnpm install`);
		}
		return result;
	} catch (error) {
		context.failures.push(`Failed to restore ${action.target}: ${getErrorMessage(error)}`);
		return null;
	}
}

function executeLink(action: LinkAction, context: ActionContext): LinkResult | null {
	if (!context.dependencies.outputExists(action.outputPath)) {
		context.failures.push(`Output missing for ${action.name}: ${action.outputPath}`);
		return null;
	}
	try {
		const result = context.dependencies.link({
			consumerRoot: context.consumerRoot,
			sourceDir: action.sourceDir,
			target: action.target,
		});
		if (result === "conflict") {
			context.failures.push(`Backup or target conflict at ${action.target}`);
		}
		return result;
	} catch (error) {
		context.failures.push(`Failed to link ${action.target}: ${getErrorMessage(error)}`);
		return null;
	}
}

function upsertStateTarget(
	state: LinkState,
	action: LinkAction | Extract<LinkPlan["actions"][number], { kind: "keep" }>,
	linkedAt: string,
): LinkState {
	const existing = state.packages[action.name];
	const targetState = { backupPath: `${action.target}${BACKUP_SUFFIX}`, path: action.target };
	const targets = [...(existing?.targets.filter(target => target.path !== action.target) ?? []), targetState].sort((left, right) =>
		left.path.localeCompare(right.path),
	);
	return {
		...state,
		packages: {
			...state.packages,
			[action.name]: {
				linkedAt,
				rootDir: action.rootDir,
				sourceDir: action.sourceDir,
				targets,
			},
		},
	};
}

function removeStateTarget(state: LinkState, name: string, targetPath: string): LinkState {
	const entry = state.packages[name];
	if (!entry) {
		return state;
	}
	const targets = entry.targets.filter(target => target.path !== targetPath);
	if (targets.length > 0) {
		return { ...state, packages: { ...state.packages, [name]: { ...entry, targets } } };
	}
	const packages = Object.fromEntries(Object.entries(state.packages).filter(([packageName]) => packageName !== name));
	return { ...state, packages };
}

function createDefaultDependencies(): ExecutorDependencies {
	return {
		link: linkTarget,
		now: () => new Date().toISOString(),
		outputExists: existsSync,
		restore: restoreTarget,
		runBuild: async action =>
			await runBuild({
				rootDir: action.rootDir,
				strategy: detectBuildStrategy(action.rootDir, action.buildTarget),
				target: action.buildTarget,
			}),
		writeState: writeLinkState,
	};
}

function getErrorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}
