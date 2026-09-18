import { existsSync, lstatSync, readdirSync } from "node:fs";
import { isAbsolute, join, relative, resolve } from "node:path";

import { BACKUP_SUFFIX } from "./config";

const SKIP_DIRECTORIES = new Set([".git", "dist"]);
const MAX_SCAN_DEPTH = 4;

export function findConsumerTargets(consumerRoot: string, packageName: string, excludedRoots: string[] = []): string[] {
	const packageSegments = splitPackageName(packageName);
	const normalizedRoot = resolve(consumerRoot);
	const normalizedExclusions = excludedRoots.map(path => resolve(path));
	const targets = new Set<string>();

	function scan(directory: string, depth: number): void {
		if (depth > MAX_SCAN_DEPTH || normalizedExclusions.some(excluded => isPathInside(excluded, directory))) {
			return;
		}

		const target = join(directory, "node_modules", ...packageSegments);
		if (pathOrBackupExists(target)) {
			targets.add(target);
		}

		for (const entry of readDirectories(directory)) {
			if (entry === "node_modules") {
				const pnpmDirectory = join(directory, "node_modules", ".pnpm");
				for (const pnpmTarget of findPnpmTargets(pnpmDirectory, packageSegments)) {
					targets.add(pnpmTarget);
				}
				continue;
			}
			if (!SKIP_DIRECTORIES.has(entry)) {
				scan(join(directory, entry), depth + 1);
			}
		}
	}

	scan(normalizedRoot, 0);
	return [...targets].sort();
}

function findPnpmTargets(pnpmDirectory: string, packageSegments: string[]): string[] {
	const targets: string[] = [];
	for (const entry of readDirectories(pnpmDirectory)) {
		const target = join(pnpmDirectory, entry, "node_modules", ...packageSegments);
		if (pathOrBackupExists(target)) {
			targets.push(target);
		}
	}
	return targets;
}

function splitPackageName(packageName: string): string[] {
	const segments = packageName.split("/");
	const valid = packageName.startsWith("@") ? segments.length === 2 && segments.every(Boolean) : segments.length === 1 && Boolean(segments[0]);
	if (!valid) {
		throw new Error(`Invalid package name: ${packageName}`);
	}
	return segments;
}

function pathOrBackupExists(target: string): boolean {
	return pathExists(target) || pathExists(`${target}${BACKUP_SUFFIX}`);
}

function pathExists(path: string): boolean {
	try {
		lstatSync(path);
		return true;
	} catch {
		return existsSync(path);
	}
}

function readDirectories(directory: string): string[] {
	try {
		return readdirSync(directory, { withFileTypes: true })
			.filter(entry => entry.isDirectory())
			.map(entry => entry.name)
			.sort();
	} catch {
		return [];
	}
}

function isPathInside(parent: string, target: string): boolean {
	const path = relative(parent, resolve(target));
	return path === "" || (!path.startsWith("..") && !isAbsolute(path));
}
