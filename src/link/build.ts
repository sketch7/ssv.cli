import { execa } from "execa";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export type BuildStrategy = "nx" | "turbo" | "pnpm" | "none";

export interface BuildRequest {
	rootDir: string;
	strategy: BuildStrategy;
	target: string;
}

export type ProcessExecutor = (command: string, args: readonly string[], options: { cwd: string; stdio: "inherit" }) => Promise<unknown>;

export function detectBuildStrategy(rootDir: string, target: string): BuildStrategy {
	if (existsSync(join(rootDir, "nx.json"))) {
		return "nx";
	}
	if (existsSync(join(rootDir, "turbo.json"))) {
		return "turbo";
	}
	return hasPackageScript(join(rootDir, "package.json"), target) ? "pnpm" : "none";
}

export async function runBuild(request: BuildRequest, execute: ProcessExecutor = executeProcess): Promise<boolean> {
	const args = getBuildArguments(request.strategy, request.target);
	if (!args) {
		return false;
	}
	try {
		await execute("pnpm", args, { cwd: request.rootDir, stdio: "inherit" });
		return true;
	} catch {
		return false;
	}
}

function getBuildArguments(strategy: BuildStrategy, target: string): string[] | null {
	if (strategy === "nx") {
		return ["nx", "run-many", "-t", target];
	}
	if (strategy === "turbo") {
		return ["turbo", "run", target];
	}
	if (strategy === "pnpm") {
		return ["run", target];
	}
	return null;
}

function hasPackageScript(manifestPath: string, target: string): boolean {
	try {
		const manifest: unknown = JSON.parse(readFileSync(manifestPath, "utf8"));
		if (typeof manifest !== "object" || manifest === null || !("scripts" in manifest)) {
			return false;
		}
		const { scripts } = manifest;
		return typeof scripts === "object" && scripts !== null && target in scripts;
	} catch {
		return false;
	}
}

async function executeProcess(command: string, args: readonly string[], options: { cwd: string; stdio: "inherit" }): Promise<void> {
	await execa(command, [...args], options);
}
