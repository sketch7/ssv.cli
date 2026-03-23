import type { MassCommandsConfig, RepoConfig } from "./config-schema.js";

export type InterpolationVars = Record<string, string>;

/**
 * Replaces {{key}} tokens in a template string with values from the vars map.
 * Unknown tokens are left as-is.
 */
export function interpolate(template: string, vars: InterpolationVars): string {
	return template.replace(/\{\{([^}]+)\}\}/g, (_match, key: string) => {
		const trimmed = key.trim();
		return trimmed in vars ? vars[trimmed] : `{{${trimmed}}}`;
	});
}

/**
 * Builds the full interpolation variable map for a given repo.
 *
 * Resolution priority:
 * - config.vars (lowest — generic config-level vars)
 * - Built-in tokens: repo.name, projectName (alias), org
 *   - org resolution: repo.org → config.org → config.vars?.org → ""
 *
 * Available tokens in URLs and commands:
 *   {{repo.name}}     — the repository name (e.g. "ssv-core")
 *   {{projectName}}   — alias for {{repo.name}}
 *   {{org}}           — organisation (e.g. "sketch7")
 *   {{anyKey}}        — any key defined in config.vars
 */
export function buildVars(config: MassCommandsConfig, repo: RepoConfig): InterpolationVars {
	const org = repo.org ?? config.org ?? config.vars?.["org"] ?? "";

	return {
		// config.vars spread first so built-ins always win
		...config.vars,
		"repo.name": repo.name,
		projectName: repo.name,
		org: org,
	};
}
