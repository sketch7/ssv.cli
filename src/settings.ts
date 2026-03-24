import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import * as v from "valibot";

const SsvSettingsSchema = v.object({
	massExecDir: v.optional(v.pipe(v.string(), v.description("Registered directory scanned for mass-exec config files"))),
});

export type SsvSettings = v.InferOutput<typeof SsvSettingsSchema>;

export function getSettingsPath(): string {
	return join(homedir(), ".ssv", "config.json");
}

export function readSettings(): SsvSettings {
	const settingsPath = getSettingsPath();
	if (!existsSync(settingsPath)) {
		return {};
	}
	try {
		const raw = JSON.parse(readFileSync(settingsPath, "utf8"));
		const result = v.safeParse(SsvSettingsSchema, raw);
		return result.success ? result.output : {};
	} catch {
		return {};
	}
}

export function writeSettings(settings: SsvSettings): void {
	const settingsPath = getSettingsPath();
	mkdirSync(dirname(settingsPath), { recursive: true });
	writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + "\n", "utf8");
}
