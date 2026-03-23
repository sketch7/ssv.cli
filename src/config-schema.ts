import * as v from "valibot";

const CommandEntrySchema = v.pipe(
	v.record(v.string(), v.string()),
	v.check(val => Object.keys(val).length === 1, "Each command entry must have exactly one key"),
	v.description('A single-key record mapping a command name to a shell expression, e.g. { "git-pull": "git pull" }'),
);

const RepoSchema = v.object({
	name: v.pipe(v.string(), v.description('Repository name, e.g. "ssv-core"')),
	url: v.optional(
		v.pipe(
			v.string(),
			v.description(
				"Git clone URL. Supports interpolation: {{repo.name}}, {{org}}, {{projectName}}, and any vars. Overrides config-level repoUrlTemplate.",
			),
		),
	),
	org: v.optional(v.pipe(v.string(), v.description("Per-repo org override — used for {{org}} interpolation"))),
	clonePrefix: v.optional(v.pipe(v.string(), v.description("Per-repo clone prefix override (overrides config-level clonePrefix)"))),
	commands: v.optional(v.pipe(v.array(CommandEntrySchema), v.description("Commands specific to this repo, run after global commands"))),
	skipGlobalCommands: v.optional(v.pipe(v.array(v.string()), v.description("Keys of globalCommands entries to skip for this repo"))),
});

const MassCommandsConfigSchema = v.object({
	$schema: v.optional(v.string()),
	clonePrefix: v.optional(v.pipe(v.string(), v.description('Prefix prepended to the local clone folder name, e.g. "@ssv" or "sketch7"'))),
	shell: v.optional(v.pipe(v.string(), v.description('Shell to use for executing commands, e.g. "powershell", "bash", "sh"'))),
	org: v.optional(v.pipe(v.string(), v.description("Config-level org — used as {{org}} fallback when repo.org is not set"))),
	repoUrlTemplate: v.optional(
		v.pipe(
			v.string(),
			v.description(
				'Default URL template for cloning repos when repo.url is not set. Supports interpolation: {{repo.name}}, {{org}}, {{projectName}}, and any vars. e.g. "https://github.com/{{org}}/{{repo.name}}.git"',
			),
		),
	),
	vars: v.optional(
		v.pipe(
			v.record(v.string(), v.string()),
			v.description("Generic string variables available for interpolation in URLs and commands. Also used as fallback for {{org}} via vars.org."),
		),
	),
	repos: v.pipe(v.array(RepoSchema), v.description("Repositories to process")),
	globalCommands: v.optional(
		v.pipe(v.array(CommandEntrySchema), v.description("Commands run for every repo (filtered by skipGlobalCommands per repo)")),
	),
});

/** A single-key record mapping a command name to a shell expression, e.g. `{ "git-pull": "git pull" }` */
export type CommandEntry = v.InferOutput<typeof CommandEntrySchema>;

/** Configuration for a single repository entry */
export type RepoConfig = v.InferOutput<typeof RepoSchema>;

/** Root configuration for mass-exec */
export type MassCommandsConfig = v.InferOutput<typeof MassCommandsConfigSchema>;

export { CommandEntrySchema, MassCommandsConfigSchema, RepoSchema };
