import type { Command } from "commander";
import { consola } from "consola";
import { colors } from "consola/utils";
import { resolve } from "node:path";

import { initializeLinkConfig } from "../link/config";
import type { InitOptions, InitResult } from "../link/config";
import { reconcileLinks } from "../link/reconcile";
import type { ReconcileOptions, ReconcileResult } from "../link/reconcile";

interface LinkCliOptions {
	build: boolean;
	config?: string;
	dryRun: boolean;
	root?: string;
}

interface InitCliOptions {
	force: boolean;
	root?: string;
}

export interface LinkCommandDependencies {
	initialize: (options: InitOptions) => InitResult;
	reconcile: (options: ReconcileOptions) => Promise<ReconcileResult>;
}

const DEFAULT_DEPENDENCIES: LinkCommandDependencies = {
	initialize: initializeLinkConfig,
	reconcile: reconcileLinks,
};

export default function registerLinkCommand(program: Command, dependencies = DEFAULT_DEPENDENCIES): void {
	const link = program
		.command("link")
		.description("Link local pnpm packages into this repository")
		.option("-r, --root <path>", "Consumer repository root (defaults to the current directory)")
		.option("--config <path>", "Configuration file (defaults to .ssv-links.yaml under the root)")
		.option("--no-build", "Skip automatic builds for packages with missing output")
		.option("-d, --dry-run", "Show the reconciliation plan without builds or filesystem changes", false)
		.action(async (options: LinkCliOptions) => {
			const consumerRoot = resolve(options.root ?? process.cwd());
			try {
				consola.start(`Reconciling local package links in ${colors.dim(consumerRoot)}`);
				const result = await dependencies.reconcile({
					...(options.config ? { configFile: resolve(consumerRoot, options.config) } : {}),
					consumerRoot,
					dryRun: options.dryRun,
					noBuild: !options.build,
				});
				renderResult(result, options.dryRun);
				if (!result.execution.success) {
					process.exitCode = 1;
				}
			} catch (error) {
				consola.error(getErrorMessage(error));
				process.exitCode = 1;
			}
		});

	link
		.command("init")
		.description("Create a starter .ssv-links.yaml configuration")
		.option("-r, --root <path>", "Repository root (defaults to the current directory)")
		.option("-f, --force", "Overwrite an existing .ssv-links.yaml", false)
		.action((options: InitCliOptions, command: Command) => {
			const parentOptions = command.parent?.opts<LinkCliOptions>();
			const rootDir = resolve(options.root ?? parentOptions?.root ?? process.cwd());
			try {
				const result = dependencies.initialize({ force: options.force, rootDir });
				const verb = result.overwritten ? "Overwrote" : "Created";
				consola.success(`${verb} ${colors.cyan(result.configFile)}`);
				consola.info(`Updated ${colors.dim(result.gitignoreFile)}`);
			} catch (error) {
				consola.error(getErrorMessage(error));
				process.exitCode = 1;
			}
		});
}

function renderResult(result: ReconcileResult, dryRun: boolean): void {
	if (dryRun) {
		consola.info(colors.yellow("DRY-RUN reconciliation plan"));
		for (const action of result.plan.actions) {
			consola.log(formatPlanAction(action));
		}
		return;
	}

	for (const warning of result.execution.warnings) {
		consola.warn(warning);
	}
	for (const failure of result.execution.failures) {
		consola.error(failure);
	}
	if (result.execution.success) {
		consola.success(`Links reconciled (${result.execution.linked} linked, ${result.execution.restored} restored)`);
	}
}

function formatPlanAction(action: ReconcileResult["plan"]["actions"][number]): string {
	if (action.kind === "warn") {
		return `${colors.yellow("WARN")} ${action.message}`;
	}
	if (action.kind === "build") {
		return `${colors.yellow("BUILD")} ${colors.cyan(action.rootDir)} ${colors.white(`pnpm ${action.buildTarget}`)}`;
	}
	if (action.kind === "restore") {
		return `${colors.yellow("RESTORE")} ${colors.cyan(action.name)} ${colors.dim(action.target)}`;
	}
	if (action.kind === "keep") {
		return `${colors.dim("KEEP")} ${colors.cyan(action.name)} ${colors.dim(action.target)}`;
	}
	return `${colors.yellow("LINK")} ${colors.cyan(action.name)} ${colors.dim(action.target)}`;
}

function getErrorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}
