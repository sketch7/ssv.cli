import type { MassCommandsConfig, ProjectConfig } from "./config-schema.js";

export type InterpolationVars = Record<string, string>;

/**
 * Replaces {key} tokens in a template string with values from the vars map.
 * Unknown tokens are left as-is.
 */
export function interpolate(template: string, vars: InterpolationVars): string {
	return template.replace(/\{([^{}]+)\}/g, (_match, key: string) => {
		const trimmed = key.trim();
		return trimmed in vars ? vars[trimmed] : `{${trimmed}}`;
	});
}

/**
 * Builds the full interpolation variable map for a given project.
 *
 * Resolution priority:
 * - config.vars (lowest — generic config-level vars)
 * - Built-in tokens: projectName, org
 *   - org resolution: project.org → config.org → config.vars?.org → ""
 *
 * Available tokens in URLs and commands:
 *   {projectName}   — the project name (e.g. "ssv-core")
 *   {org}            — organisation (e.g. "sketch7")
 *   {anyKey}         — any key defined in config.vars
 */
export function buildVars(config: MassCommandsConfig, project: ProjectConfig): InterpolationVars {
	const org = project.org ?? config.org ?? config.vars?.["org"] ?? "";

	return {
		// config.vars spread first (lowest priority)
		...config.vars,
		// project.vars override config.vars
		...project.vars,
		// built-ins always win
		projectName: project.name,
		org: org,
	};
}
