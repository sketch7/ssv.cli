import { existsSync } from "node:fs";
import { isAbsolute, join, resolve } from "node:path";

import { DEFAULT_CONFIG_FILE, DEFAULT_STATE_FILE, loadLinkConfig, loadLinkState } from "./config";
import { discoverPackages } from "./discover-packages";
import { executeLinkPlan } from "./executor";
import type { ExecutionResult } from "./executor";
import { inspectTarget } from "./filesystem";
import { findConsumerTargets } from "./find-consumers";
import { createLinkPlan } from "./planner";
import type { DesiredPackage, LinkPlan } from "./planner";

export interface ReconcileOptions {
	configFile?: string;
	consumerRoot: string;
	dryRun: boolean;
	noBuild: boolean;
}

export interface ReconcileResult {
	execution: ExecutionResult;
	plan: LinkPlan;
}

export async function reconcileLinks(options: ReconcileOptions): Promise<ReconcileResult> {
	const consumerRoot = resolve(options.consumerRoot);
	const configFile = resolveConfiguredPath(consumerRoot, options.configFile ?? DEFAULT_CONFIG_FILE);
	const stateFile = join(consumerRoot, DEFAULT_STATE_FILE);
	const config = loadLinkConfig(configFile);
	const state = loadLinkState(stateFile);
	const warnings: string[] = [];
	const desired: DesiredPackage[] = [];
	const sourceRoots = Object.keys(config.links).map(path => resolveConfiguredPath(consumerRoot, path));

	for (const [configuredRoot, entry] of Object.entries(config.links).sort(([left], [right]) => left.localeCompare(right))) {
		if (entry.packages.length === 0) {
			continue;
		}
		const rootDir = resolveConfiguredPath(consumerRoot, configuredRoot);
		if (!existsSync(rootDir)) {
			warnings.push(`Source root does not exist: ${rootDir} (configured as "${configuredRoot}")`);
			continue;
		}

		const packages = discoverPackages(rootDir);
		for (const name of [...entry.packages].sort()) {
			const pkg = packages.get(name);
			if (!pkg) {
				const available = [...packages.keys()].sort().join(", ") || "none";
				warnings.push(`Package ${name} was not found under ${rootDir}. Available: ${available}`);
				continue;
			}
			const targets = findConsumerTargets(consumerRoot, name, sourceRoots).map(path => ({
				path,
				status: inspectTarget(path, pkg.sourceDir),
			}));
			const outputPath = resolve(pkg.sourceDir, entry.output);
			desired.push({
				buildTarget: entry.build,
				name,
				outputExists: existsSync(outputPath),
				outputPath,
				rootDir,
				sourceDir: pkg.sourceDir,
				targets,
			});
		}
	}

	const plan = createLinkPlan({ desired, noBuild: options.noBuild, state, warnings });
	const execution = await executeLinkPlan(plan, {
		consumerRoot,
		dryRun: options.dryRun,
		state,
		stateFile,
	});
	return { execution, plan };
}

function resolveConfiguredPath(rootDir: string, path: string): string {
	return isAbsolute(path) ? resolve(path) : resolve(rootDir, path);
}
