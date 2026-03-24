import type { Dirent } from "node:fs";
import { readdirSync } from "node:fs";
import { join, relative } from "node:path";

export interface ConfigEntry {
	name: string;
	filePath: string;
}

export function discoverConfigs(dir: string): ConfigEntry[] {
	let entries: Dirent[];
	try {
		entries = readdirSync(dir, { recursive: true, withFileTypes: true });
	} catch {
		return [];
	}

	return entries
		.filter(e => {
			if (!e.isFile() || !e.name.endsWith(".json")) return false;
			// Exclude common non-config directories
			const rel = relative(dir, join(e.parentPath, e.name)).replace(/\\/g, "/");
			return !rel.split("/").some(seg => seg === "node_modules" || seg === ".git");
		})
		.map(e => {
			const filePath = join(e.parentPath, e.name);
			const raw = relative(dir, filePath).replace(/\\/g, "/").replace(/\.json$/, "");
			const name = trimRedundantSegmentPrefix(raw);
			return { name, filePath };
		})
		.sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Trims redundant parent-prefix from the last segment.
 * e.g. `ssv/ssv.tools` → `ssv/tools`, `bssn/bssn.fe` → `bssn/fe`
 */
function trimRedundantSegmentPrefix(name: string): string {
	const slashIdx = name.lastIndexOf("/");
	if (slashIdx === -1) return name;
	const parent = name.slice(0, slashIdx);
	const stem = name.slice(slashIdx + 1);
	const parentLeaf = parent.slice(parent.lastIndexOf("/") + 1);
	const prefix = parentLeaf + ".";
	if (stem.startsWith(prefix) && stem.length > prefix.length) {
		return parent + "/" + stem.slice(prefix.length);
	}
	return name;
}

export interface ResolveResult {
	resolved: ConfigEntry[];
	unresolved: string[];
}

export function resolveNames(names: string[], discovered: ConfigEntry[]): ResolveResult {
	const seen = new Set<string>();
	const resolved: ConfigEntry[] = [];
	const unresolved: string[] = [];

	for (const name of names) {
		if (name === "all") {
			for (const entry of discovered) {
				if (!seen.has(entry.filePath)) {
					seen.add(entry.filePath);
					resolved.push(entry);
				}
			}
			continue;
		}

		const lower = name.toLowerCase();

		// Exact match (case-insensitive)
		const exact = discovered.find(e => e.name.toLowerCase() === lower);
		if (exact) {
			if (!seen.has(exact.filePath)) {
				seen.add(exact.filePath);
				resolved.push(exact);
			}
			continue;
		}

		// Prefix match: `ssv` → all entries starting with `ssv/`
		const prefix = lower + "/";
		const prefixMatches = discovered.filter(e => e.name.toLowerCase().startsWith(prefix));
		if (prefixMatches.length > 0) {
			for (const entry of prefixMatches) {
				if (!seen.has(entry.filePath)) {
					seen.add(entry.filePath);
					resolved.push(entry);
				}
			}
			continue;
		}

		unresolved.push(name);
	}

	return { resolved, unresolved };
}
