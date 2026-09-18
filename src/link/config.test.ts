import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
	BACKUP_SUFFIX,
	DEFAULT_CONFIG_FILE,
	DEFAULT_STATE_FILE,
	initializeLinkConfig,
	loadLinkConfig,
	loadLinkState,
	writeLinkState,
} from "./config";

const tempDirectories: string[] = [];

function createTempDirectory(): string {
	const directory = mkdtempSync(join(tmpdir(), "ssv-link-config-"));
	tempDirectories.push(directory);
	return directory;
}

afterEach(() => {
	for (const directory of tempDirectories.splice(0)) {
		rmSync(directory, { force: true, recursive: true });
	}
});

describe("loadLinkConfig", () => {
	it("loads and normalizes valid YAML", () => {
		const rootDir = createTempDirectory();
		const configFile = join(rootDir, DEFAULT_CONFIG_FILE);
		writeFileSync(configFile, "links:\n  ../source:\n    packages:\n      - '@scope/package'\n", "utf8");

		expect(loadLinkConfig(configFile)).toEqual({
			links: {
				"../source": { build: "build", output: "dist", packages: ["@scope/package"] },
			},
		});
	});

	it("guides users to init when configuration is missing", () => {
		const configFile = join(createTempDirectory(), DEFAULT_CONFIG_FILE);

		expect(() => loadLinkConfig(configFile)).toThrow(/ssv link init/);
	});

	it("reports malformed YAML with its file path", () => {
		const rootDir = createTempDirectory();
		const configFile = join(rootDir, DEFAULT_CONFIG_FILE);
		writeFileSync(configFile, "links: [", "utf8");

		expect(() => loadLinkConfig(configFile)).toThrow(configFile);
	});

	it("reports invalid fields with their dot path", () => {
		const rootDir = createTempDirectory();
		const configFile = join(rootDir, DEFAULT_CONFIG_FILE);
		writeFileSync(configFile, "links:\n  source:\n    packages: [UpperCase]\n", "utf8");

		expect(() => loadLinkConfig(configFile)).toThrow(/links\.source\.packages\.0/);
	});
});

describe("link state", () => {
	it("uses empty versioned state only when the state file is absent", () => {
		const stateFile = join(createTempDirectory(), DEFAULT_STATE_FILE);

		expect(loadLinkState(stateFile)).toEqual({ packages: {}, version: 1 });
	});

	it("fails closed when persisted state is malformed", () => {
		const stateFile = join(createTempDirectory(), DEFAULT_STATE_FILE);
		writeFileSync(stateFile, "not-json", "utf8");

		expect(() => loadLinkState(stateFile)).toThrow(stateFile);
	});

	it("atomically writes state that can be loaded again", () => {
		const stateFile = join(createTempDirectory(), DEFAULT_STATE_FILE);
		const state = { packages: {}, version: 1 } as const;

		writeLinkState(stateFile, state);

		expect(loadLinkState(stateFile)).toEqual(state);
		expect(existsSync(`${stateFile}.tmp`)).toBe(false);
	});
});

describe("initializeLinkConfig", () => {
	it("creates a valid template and idempotent ignore entries", () => {
		const rootDir = createTempDirectory();

		const result = initializeLinkConfig({ force: false, rootDir });
		initializeLinkConfig({ force: true, rootDir });

		expect(loadLinkConfig(result.configFile)).toEqual({
			$schema: "https://raw.githubusercontent.com/sketch7/ssv.cli/refs/heads/v1/ssv-links.config.schema.json",
			links: {},
		});
		const gitignore = readFileSync(join(rootDir, ".gitignore"), "utf8");
		expect(gitignore.match(new RegExp(DEFAULT_STATE_FILE.replaceAll(".", "\\."), "g"))).toHaveLength(1);
		expect(gitignore.match(new RegExp(`\\*${BACKUP_SUFFIX.replaceAll(".", "\\.")}`, "g"))).toHaveLength(1);
	});

	it("refuses to overwrite configuration unless forced", () => {
		const rootDir = createTempDirectory();
		initializeLinkConfig({ force: false, rootDir });

		expect(() => initializeLinkConfig({ force: false, rootDir })).toThrow(/already exists/);
	});
});
