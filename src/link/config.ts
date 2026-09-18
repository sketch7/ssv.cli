import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import * as v from "valibot";
import { parse as parseYaml } from "yaml";

import { formatValidationError } from "./errors";
import { LinkConfigSchema, LinkStateSchema } from "./schema";
import type { LinkConfig, LinkState } from "./schema";

export const DEFAULT_CONFIG_FILE = ".ssv-links.yaml";
export const DEFAULT_STATE_FILE = ".ssv-links.state.json";
export const BACKUP_SUFFIX = ".ssv-registry-backup";

const LINK_SCHEMA_URL = "https://raw.githubusercontent.com/sketch7/ssv.cli/refs/heads/v1/ssv-links.config.schema.json";

const CONFIG_TEMPLATE = `# yaml-language-server: $schema=${LINK_SCHEMA_URL}
$schema: ${LINK_SCHEMA_URL}

# Source roots may be absolute or relative to this repository.
links: {}
`;

const IGNORE_ENTRIES = [DEFAULT_STATE_FILE, `*${BACKUP_SUFFIX}`] as const;

export interface InitOptions {
	force: boolean;
	rootDir: string;
}

export interface InitResult {
	configFile: string;
	gitignoreFile: string;
	overwritten: boolean;
}

export function loadLinkConfig(configFile: string): LinkConfig {
	if (!existsSync(configFile)) {
		throw new Error(`Link configuration not found: ${configFile}\nRun \`ssv link init\` to create it.`);
	}

	let input: unknown;
	try {
		input = parseYaml(readFileSync(configFile, "utf8"));
	} catch (error) {
		throw new Error(`Failed to parse ${configFile}: ${getErrorMessage(error)}`, { cause: error });
	}

	const result = v.safeParse(LinkConfigSchema, input ?? {});
	if (!result.success) {
		throw new Error(formatValidationError(result.issues, configFile));
	}
	return result.output;
}

export function loadLinkState(stateFile: string): LinkState {
	if (!existsSync(stateFile)) {
		return { packages: {}, version: 1 };
	}

	let input: unknown;
	try {
		input = JSON.parse(readFileSync(stateFile, "utf8"));
	} catch (error) {
		throw new Error(`Failed to parse ${stateFile}: ${getErrorMessage(error)}`, { cause: error });
	}

	const result = v.safeParse(LinkStateSchema, input);
	if (!result.success) {
		throw new Error(formatValidationError(result.issues, stateFile));
	}
	return result.output;
}

export function writeLinkState(stateFile: string, state: LinkState): void {
	mkdirSync(dirname(stateFile), { recursive: true });
	const temporaryFile = `${stateFile}.tmp`;
	try {
		writeFileSync(temporaryFile, `${JSON.stringify(state, null, 2)}\n`, "utf8");
		renameSync(temporaryFile, stateFile);
	} catch (error) {
		rmSync(temporaryFile, { force: true });
		throw error;
	}
}

export function initializeLinkConfig(options: InitOptions): InitResult {
	mkdirSync(options.rootDir, { recursive: true });
	const configFile = join(options.rootDir, DEFAULT_CONFIG_FILE);
	const gitignoreFile = join(options.rootDir, ".gitignore");
	const overwritten = existsSync(configFile);
	if (overwritten && !options.force) {
		throw new Error(`${configFile} already exists. Pass --force to overwrite it.`);
	}

	writeFileSync(configFile, CONFIG_TEMPLATE, "utf8");
	ensureIgnoreEntries(gitignoreFile);
	return { configFile, gitignoreFile, overwritten };
}

function ensureIgnoreEntries(gitignoreFile: string): void {
	const existing = existsSync(gitignoreFile) ? readFileSync(gitignoreFile, "utf8") : "";
	const lines = existing.split(/\r?\n/u);
	const missing = IGNORE_ENTRIES.filter(entry => !lines.includes(entry));
	if (missing.length === 0) {
		return;
	}

	const prefix = existing.length === 0 || existing.endsWith("\n") ? existing : `${existing}\n`;
	writeFileSync(gitignoreFile, `${prefix}${missing.join("\n")}\n`, "utf8");
}

function getErrorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}
