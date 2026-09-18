import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const SKIP_DIRECTORIES = new Set(["node_modules", ".git", "dist", ".nx", ".turbo", "coverage", "build"]);
const MAX_DISCOVERY_DEPTH = 5;

export interface LinkablePackage {
	name: string;
	rootDir: string;
	sourceDir: string;
}

interface ScanContext {
	packages: Map<string, LinkablePackage>;
	rootDir: string;
}

export function discoverPackages(rootDir: string): Map<string, LinkablePackage> {
	const packages = new Map<string, LinkablePackage>();
	if (!existsSync(rootDir)) {
		return packages;
	}

	for (const entry of readDirectories(rootDir)) {
		if (!SKIP_DIRECTORIES.has(entry)) {
			scanDirectory(join(rootDir, entry), 1, { packages, rootDir });
		}
	}
	return packages;
}

function scanDirectory(directory: string, depth: number, context: ScanContext): void {
	if (depth > MAX_DISCOVERY_DEPTH) {
		return;
	}

	const manifestPath = join(directory, "package.json");
	if (existsSync(manifestPath)) {
		const name = readPackageName(manifestPath);
		if (name && !context.packages.has(name)) {
			context.packages.set(name, { name, rootDir: context.rootDir, sourceDir: directory });
		}
		return;
	}

	for (const entry of readDirectories(directory)) {
		if (!SKIP_DIRECTORIES.has(entry)) {
			scanDirectory(join(directory, entry), depth + 1, context);
		}
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

function readPackageName(manifestPath: string): string | null {
	try {
		const manifest: unknown = JSON.parse(readFileSync(manifestPath, "utf8"));
		if (typeof manifest === "object" && manifest !== null && "name" in manifest && typeof manifest.name === "string") {
			return manifest.name;
		}
	} catch {
		// An unreadable package is not linkable; sibling discovery can continue.
	}
	return null;
}
