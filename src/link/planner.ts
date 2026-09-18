import type { TargetStatus } from "./filesystem";
import type { LinkState } from "./schema";

export interface DesiredTarget {
	path: string;
	status: TargetStatus;
}

export interface DesiredPackage {
	buildTarget: string;
	name: string;
	outputExists: boolean;
	outputPath: string;
	rootDir: string;
	sourceDir: string;
	targets: DesiredTarget[];
}

export interface CreateLinkPlanInput {
	desired: DesiredPackage[];
	noBuild: boolean;
	state: LinkState;
	warnings: string[];
}

export interface BuildAction {
	buildTarget: string;
	kind: "build";
	rootDir: string;
}

export interface LinkAction {
	kind: "link";
	name: string;
	outputPath: string;
	rootDir: string;
	sourceDir: string;
	target: string;
}

export interface KeepAction {
	kind: "keep";
	name: string;
	rootDir: string;
	sourceDir: string;
	target: string;
}

export interface RestoreAction {
	kind: "restore";
	name: string;
	rootDir: string;
	sourceDir: string;
	target: string;
}

export interface WarnAction {
	kind: "warn";
	message: string;
	rootDir?: undefined;
}

export type PlanAction = BuildAction | LinkAction | KeepAction | RestoreAction | WarnAction;

export interface LinkPlan {
	actions: PlanAction[];
}

export function createLinkPlan(input: CreateLinkPlanInput): LinkPlan {
	const actions: PlanAction[] = [...input.warnings].sort().map(message => ({ kind: "warn" as const, message }));
	const desired = [...input.desired].sort((left, right) => left.name.localeCompare(right.name));
	const desiredByName = new Map(desired.map(pkg => [pkg.name, pkg]));

	const restoreActions = createRestoreActions(input.state, desiredByName);
	const restoredTargets = new Set(restoreActions.map(action => action.target));
	actions.push(...restoreActions);
	actions.push(...createBuildActions(desired, input.noBuild));
	for (const pkg of desired) {
		actions.push(...createPackageActions(pkg, input.noBuild, restoredTargets));
	}

	return { actions };
}

function createRestoreActions(state: LinkState, desiredByName: Map<string, DesiredPackage>): RestoreAction[] {
	const actions: RestoreAction[] = [];
	for (const [name, entry] of Object.entries(state.packages).sort(([left], [right]) => left.localeCompare(right))) {
		const desired = desiredByName.get(name);
		const desiredTargets = new Set(desired?.targets.map(target => target.path) ?? []);
		const sourceChanged = desired ? desired.sourceDir !== entry.sourceDir : false;
		for (const target of [...entry.targets].sort((left, right) => left.path.localeCompare(right.path))) {
			if (!desired || sourceChanged || !desiredTargets.has(target.path)) {
				actions.push({
					kind: "restore",
					name,
					rootDir: entry.rootDir,
					sourceDir: entry.sourceDir,
					target: target.path,
				});
			}
		}
	}
	return actions;
}

function createBuildActions(desired: DesiredPackage[], noBuild: boolean): BuildAction[] {
	if (noBuild) {
		return [];
	}
	const builds = new Map<string, BuildAction>();
	for (const pkg of desired) {
		if (!pkg.outputExists && pkg.targets.length > 0 && !builds.has(pkg.rootDir)) {
			builds.set(pkg.rootDir, { buildTarget: pkg.buildTarget, kind: "build", rootDir: pkg.rootDir });
		}
	}
	return [...builds.values()].sort((left, right) => left.rootDir.localeCompare(right.rootDir));
}

function createPackageActions(pkg: DesiredPackage, noBuild: boolean, restoredTargets: Set<string>): PlanAction[] {
	if (pkg.targets.length === 0) {
		return [{ kind: "warn", message: `${pkg.name} has no consumers in this repository` }];
	}
	if (!pkg.outputExists && noBuild) {
		return [
			{
				kind: "warn",
				message: `${pkg.name} has no output at ${pkg.outputPath}; skipped because --no-build is set`,
			},
		];
	}

	return [...pkg.targets].sort((left, right) => left.path.localeCompare(right.path)).map(target => createTargetAction(pkg, target, restoredTargets));
}

function createTargetAction(pkg: DesiredPackage, target: DesiredTarget, restoredTargets: Set<string>): PlanAction {
	const common = { name: pkg.name, rootDir: pkg.rootDir, sourceDir: pkg.sourceDir, target: target.path };
	if (target.status === "already-linked") {
		return { ...common, kind: "keep" };
	}
	if (target.status === "linkable" || target.status === "backup-only" || (target.status === "conflict" && restoredTargets.has(target.path))) {
		return { ...common, kind: "link", outputPath: pkg.outputPath };
	}
	return {
		kind: "warn",
		message: `${pkg.name} target ${target.path} cannot be linked because it is ${target.status}`,
	};
}
