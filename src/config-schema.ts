import * as v from "valibot";

const StepSchema = v.object({
	name: v.pipe(v.string(), v.description("Step identifier")),
	run: v.pipe(v.string(), v.description("Shell expression to execute. Supports interpolation tokens.")),
	needs: v.optional(
		v.pipe(
			v.array(v.string()),
			v.description("Names of steps that must complete before this one runs (informational — used for validation and documentation)"),
		),
	),
	parallel: v.optional(
		v.pipe(v.boolean(), v.description("When true, this step is grouped with adjacent parallel steps and runs concurrently with them")),
	),
});

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
	steps: v.optional(v.pipe(v.array(StepSchema), v.description("Steps specific to this project, run after global steps"))),
	skipGlobalSteps: v.optional(v.pipe(v.array(v.string()), v.description("Names of globalSteps entries to skip for this project"))),
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
	projects: v.pipe(v.array(ProjectSchema), v.description("Projects to process")),
	globalSteps: v.optional(v.pipe(v.array(StepSchema), v.description("Steps run for every project (filtered by skipGlobalSteps per project)"))),
});

/** A step — named shell command with optional parallel grouping and dependency declaration */
export type Step = v.InferOutput<typeof StepSchema>;

/** Configuration for a single project entry */
export type ProjectConfig = v.InferOutput<typeof ProjectSchema>;

/** Root configuration for mass-exec */
export type MassCommandsConfig = v.InferOutput<typeof MassCommandsConfigSchema>;

export { MassCommandsConfigSchema, ProjectSchema, StepSchema };
