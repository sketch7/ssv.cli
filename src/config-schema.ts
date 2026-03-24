import * as v from "valibot";

/** Shorthand: `{ "build": "npm run build" }` — backward-compatible single-key record */
const CommandEntryShorthandSchema = v.pipe(
	v.record(v.string(), v.string()),
	v.check(val => Object.keys(val).length === 1, "Each command entry must have exactly one key"),
	v.description('A single-key record mapping a command name to a shell expression, e.g. { "git-pull": "git pull" }'),
);

/** Rich object form: allows `needs` for dependency ordering */
const CommandEntryObjectSchema = v.object({
	name: v.pipe(v.string(), v.description("Command identifier")),
	run: v.pipe(v.string(), v.description("Shell expression to execute. Supports interpolation tokens.")),
	needs: v.optional(
		v.pipe(v.array(v.string()), v.description("Names of commands that must complete before this one runs (within the same context)")),
	),
});

const CommandEntrySchema = v.union([CommandEntryShorthandSchema, CommandEntryObjectSchema]);

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
	parallelCommands: v.optional(
		v.pipe(v.boolean(), v.description("Run commands concurrently for this project. Overrides config-level parallelCommands. Default: false")),
	),
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
	concurrency: v.optional(
		v.pipe(
			v.number(),
			v.integer(),
			v.minValue(1),
			v.description("Number of projects to run concurrently. Overridden by CLI --concurrency flag. Default: 5"),
		),
	),
	parallelCommands: v.optional(
		v.pipe(
			v.boolean(),
			v.description(
				"Run commands (globalCommands and project commands) concurrently within each project. Waves are determined by `needs` dependencies. Default: false (sequential)",
			),
		),
	),
	projects: v.pipe(v.array(ProjectSchema), v.description("Projects to process")),
	globalCommands: v.optional(
		v.pipe(v.array(CommandEntrySchema), v.description("Commands run for every project (filtered by skipGlobalCommands per project)")),
	),
});

/** A single-key record mapping a command name to a shell expression, e.g. `{ "git-pull": "git pull" }` */
export type CommandEntryShorthand = v.InferOutput<typeof CommandEntryShorthandSchema>;

/** Rich command object with optional `needs` dependency list */
export type CommandEntryObject = v.InferOutput<typeof CommandEntryObjectSchema>;

/** A command entry — either shorthand or rich object form */
export type CommandEntry = v.InferOutput<typeof CommandEntrySchema>;

/** Configuration for a single project entry */
export type ProjectConfig = v.InferOutput<typeof ProjectSchema>;

/** Root configuration for mass-exec */
export type MassCommandsConfig = v.InferOutput<typeof MassCommandsConfigSchema>;

export { CommandEntryObjectSchema, CommandEntrySchema, CommandEntryShorthandSchema, MassCommandsConfigSchema, ProjectSchema };
