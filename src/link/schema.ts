import * as v from "valibot";

const PACKAGE_NAME_PATTERN = /^(?:@[a-z0-9][a-z0-9._~-]*\/)?[a-z0-9][a-z0-9._~-]*$/;

const PackageNameSchema = v.pipe(v.string(), v.regex(PACKAGE_NAME_PATTERN, 'Must be a valid npm package name, for example "@scope/package"'));

const RootLinkConfigSchema = v.strictObject({
	build: v.optional(v.pipe(v.string(), v.nonEmpty("Build target must not be empty"), v.description("pnpm, Nx, or Turbo build target")), "build"),
	output: v.optional(v.pipe(v.string(), v.nonEmpty("Output path must not be empty"), v.description("Package-relative build output path")), "dist"),
	packages: v.nullish(v.pipe(v.array(PackageNameSchema), v.description("npm package names to link from this source root")), []),
});

export const LinkConfigSchema = v.strictObject({
	$schema: v.optional(v.string()),
	links: v.optional(
		v.pipe(
			v.record(v.pipe(v.string(), v.nonEmpty("Source root must not be empty")), RootLinkConfigSchema),
			v.description("Source roots and packages to link into this repository"),
		),
		{},
	),
});

const LinkTargetStateSchema = v.strictObject({
	backupPath: v.string(),
	path: v.string(),
});

const LinkStateEntrySchema = v.strictObject({
	linkedAt: v.string(),
	rootDir: v.string(),
	sourceDir: v.string(),
	targets: v.array(LinkTargetStateSchema),
});

export const LinkStateSchema = v.strictObject({
	packages: v.record(PackageNameSchema, LinkStateEntrySchema),
	version: v.literal(1),
});

export type LinkConfig = v.InferOutput<typeof LinkConfigSchema>;
export type RootLinkConfig = v.InferOutput<typeof RootLinkConfigSchema>;
export type LinkState = v.InferOutput<typeof LinkStateSchema>;
export type LinkStateEntry = v.InferOutput<typeof LinkStateEntrySchema>;
export type LinkTargetState = v.InferOutput<typeof LinkTargetStateSchema>;
