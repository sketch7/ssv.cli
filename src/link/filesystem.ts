import { existsSync, lstatSync, mkdirSync, readlinkSync, renameSync, rmSync, symlinkSync } from "node:fs";
import { dirname, isAbsolute, relative, resolve } from "node:path";

import { BACKUP_SUFFIX } from "./config";

export type LinkResult = "linked" | "already-linked" | "conflict";
export type RestoreResult = "restored" | "not-owned" | "missing-backup";
export type TargetStatus = "already-linked" | "linkable" | "backup-only" | "conflict" | "missing";

export interface TargetInput {
	consumerRoot: string;
	sourceDir: string;
	target: string;
}

export interface LinkTargetDependencies {
	createLink?: (sourceDir: string, target: string) => void;
}

export function assertPathInsideRoot(root: string, target: string): void {
	const path = relative(resolve(root), resolve(target));
	if (path === "" || path.startsWith("..") || isAbsolute(path)) {
		throw new Error(`Refusing to modify path outside consumer root: ${target}`);
	}
}

export function pathExists(path: string): boolean {
	try {
		lstatSync(path);
		return true;
	} catch {
		return existsSync(path);
	}
}

export function isLinkedToSource(target: string, sourceDir: string): boolean {
	try {
		if (!lstatSync(target).isSymbolicLink()) {
			return false;
		}
		const destination = resolve(dirname(target), readlinkSync(target));
		return normalizePath(destination) === normalizePath(sourceDir);
	} catch {
		return false;
	}
}

export function inspectTarget(target: string, sourceDir: string): TargetStatus {
	if (isLinkedToSource(target, sourceDir)) {
		return "already-linked";
	}
	const targetExists = pathExists(target);
	const backupExists = pathExists(`${target}${BACKUP_SUFFIX}`);
	if (targetExists && backupExists) {
		return "conflict";
	}
	if (targetExists) {
		return "linkable";
	}
	if (backupExists) {
		return "backup-only";
	}
	return "missing";
}

export function linkTarget(input: TargetInput, dependencies: LinkTargetDependencies = {}): LinkResult {
	assertPathInsideRoot(input.consumerRoot, input.target);
	const status = inspectTarget(input.target, input.sourceDir);
	if (status === "already-linked") {
		return "already-linked";
	}
	if (status === "conflict" || status === "missing") {
		return "conflict";
	}

	const backupPath = `${input.target}${BACKUP_SUFFIX}`;
	const createdBackup = status === "linkable";
	if (createdBackup) {
		renameSync(input.target, backupPath);
	}

	try {
		const createLink = dependencies.createLink ?? createDirectoryLink;
		createLink(input.sourceDir, input.target);
		return "linked";
	} catch (error) {
		if (pathExists(input.target)) {
			rmSync(input.target, { force: true, recursive: true });
		}
		if (createdBackup && pathExists(backupPath)) {
			renameSync(backupPath, input.target);
		}
		throw error;
	}
}

export function restoreTarget(input: TargetInput): RestoreResult {
	assertPathInsideRoot(input.consumerRoot, input.target);
	if (!isLinkedToSource(input.target, input.sourceDir)) {
		return "not-owned";
	}

	rmSync(input.target, { force: true, recursive: true });
	const backupPath = `${input.target}${BACKUP_SUFFIX}`;
	if (!pathExists(backupPath)) {
		return "missing-backup";
	}
	renameSync(backupPath, input.target);
	return "restored";
}

function createDirectoryLink(sourceDir: string, target: string): void {
	mkdirSync(dirname(target), { recursive: true });
	symlinkSync(sourceDir, target, process.platform === "win32" ? "junction" : "dir");
}

function normalizePath(path: string): string {
	const normalized = resolve(path);
	return process.platform === "win32" ? normalized.toLowerCase() : normalized;
}
