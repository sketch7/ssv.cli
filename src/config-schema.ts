import * as v from "valibot";

const CommandEntrySchema = v.pipe(
	v.record(v.string(), v.string()),
	v.check(val => Object.keys(val).length === 1, "Each command entry must have exactly one key"),
	v.description('A single-key record mapping a command name to a shell expression, e.g. { "git-pull": "git pull" }'),
);

const ProjectSchema = v.object({
	name: v.pipe(v.string(), v.description('Project name, e.g. "ssv-core"')),
	url: v.optional(
		v.pipe(
			v.string(),
			v.description("Git clone URL. Supports interpolation: {org}, {projectName}, and any vars. Overrides config-level cloneUrlTemplate."),
		),
	),
	org: v.optional(v.pipe(v.string(), v.description("Per-project org override — used for {org} interpolation"))),
	clonePrefix: v.optional(v.pipe(v.string(), v.description("Per-project clone prefix override (overrides config-level clonePrefix)"))),
	vars: v.optional(
		v.pipe(v.record(v.string(), v.string()), v.description("Per-project variable overrides — merged over config-level vars for this project only")),
	),
	commands: v.optional(v.pipe(v.array(CommandEntrySchema), v.description("Commands specific to this project, run after global commands"))),
	skipGlobalCommands: v.optional(v.pipe(v.array(v.string()), v.description("Keys of globalCommands entries to skip for this project"))),
});

const MassCommandsConfigSchema = v.object({
	$schema: v.optional(v.string()),
	clonePrefix: v.optional(v.pipe(v.string(), v.description('Prefix prepended to the local clone folder name, e.g. "@ssv" or "sketch7"'))),
	shell: v.optional(v.pipe(v.string(), v.description('Shell to use for executing commands, e.g. "powershell", "bash", "sh"'))),
	org: v.optional(v.pipe(v.string(), v.description("Config-level org — used as {org} fallback when project.org is not set"))),
	cloneUrlTemplate: v.optional(
		v.pipe(
			v.string(),
			v.description(
				'Default URL template for cloning projects when project.url is not set. Supports interpolation: {org}, {projectName}, and any vars. e.g. "https://github.com/{org}/{projectName}.git"',
			),
		),
	),
	vars: v.optional(
		v.pipe(
			v.record(v.string(), v.string()),
			v.description("Generic string variables available for interpolation in URLs and commands. Also used as fallback for {org} via vars.org."),
		),
	),
	wsRoot: v.optional(
		v.pipe(
			v.string(),
			v.description('Per-config workspace root. Supports {wsRoot} token resolved from the global ws-root setting, e.g. "{wsRoot}/bssn"'),
		),
	),
	projects: v.pipe(v.array(ProjectSchema), v.description("Projects to process")),
	globalCommands: v.optional(
		v.pipe(v.array(CommandEntrySchema), v.description("Commands run for every project (filtered by skipGlobalCommands per project)")),
	),
});

/** A single-key record mapping a command name to a shell expression, e.g. `{ "git-pull": "git pull" }` */
export type CommandEntry = v.InferOutput<typeof CommandEntrySchema>;

/** Configuration for a single project entry */
export type ProjectConfig = v.InferOutput<typeof ProjectSchema>;

/** Root configuration for mass-exec */
export type MassCommandsConfig = v.InferOutput<typeof MassCommandsConfigSchema>;

export { CommandEntrySchema, MassCommandsConfigSchema, ProjectSchema };
