# `ssv link` Design

## Summary

Add a first-class `ssv link` command that reconciles selected pnpm packages from local source repositories into every matching consumer location in a target repository. The command replaces the existing proof of concept with a safe, testable, SSV-branded implementation built on Commander, Valibot, consola, execa, YAML, and Vitest.

The command operates on the current working directory by default and accepts `--root <path>` when another consumer repository should be targeted.

## Goals

- Provide `ssv link` as the concise public command.
- Provide `ssv link init` for discoverable setup.
- Use a commit-friendly `.ssv-links.yaml` configuration file.
- Keep machine-specific reconciliation data in ignored `.ssv-links.state.json` state.
- Link every matching package location, including pnpm virtual-store consumers, to prevent duplicate module instances.
- Back up and restore registry-installed targets without changing package manifests or lockfiles.
- Automatically build missing package outputs with pnpm, including Nx and Turbo workspaces.
- Support deterministic dry runs.
- Make reconciliation behavior independently testable with Vitest.

## Non-goals

- Supporting package managers other than pnpm in the first release.
- Modifying `package.json`, `pnpm-workspace.yaml`, or lockfiles.
- Watching source packages or running long-lived development processes.
- Publishing or linking packages globally.
- Generalizing the command into a package-manager abstraction before another manager is required.

## Public CLI

### Reconcile links

```text
ssv link [options]
```

Options:

- `--root <path>`: consumer repository root; defaults to the current working directory.
- `--config <path>`: configuration file; defaults to `<root>/.ssv-links.yaml`.
- `--no-build`: do not build source workspaces with missing outputs.
- `--dry-run`: validate and discover normally, then print the ordered plan without executing builds or filesystem changes.

The command requires a configuration file. When the default file is absent, it exits unsuccessfully and recommends `ssv link init` rather than treating the missing file as an empty configuration.

### Initialize configuration

```text
ssv link init [--root <path>] [--force]
```

Initialization:

1. Writes a documented `.ssv-links.yaml` template under the selected root.
2. Refuses to overwrite an existing configuration unless `--force` is present.
3. Idempotently adds `.ssv-links.state.json` and the SSV backup pattern to `.gitignore`.
4. Leaves `.ssv-links.yaml` trackable so teams can share link definitions.

## Configuration

The checked-in `ssv-links.config.schema.json` file is generated from the runtime Valibot schema and serves editor completion and validation.

```yaml
$schema: ./ssv-links.config.schema.json

links:
  ../sketch7.arcane.ngx:
    packages:
      - "@arcane/ngx.store"
    build: build
    output: dist
```

Each key under `links` is an absolute source root or a source root resolved relative to the consumer repository. Each entry has:

- `packages`: an array of valid npm package names to link from that source root.
- `build`: an optional non-empty pnpm/Nx/Turbo target, defaulting to `build`.
- `output`: an optional non-empty package-relative readiness path, defaulting to `dist`.

Missing or YAML-null `packages` values normalize to an empty array. Unknown configuration keys are rejected to surface mistakes. TypeScript types are inferred from Valibot schemas rather than duplicated as interfaces.

## Architecture

The implementation separates observation, decision-making, and mutation:

```text
Commander command
  -> load and validate configuration/state
  -> discover source packages and consumer targets
  -> produce a deterministic reconciliation plan
  -> render dry run OR execute guarded actions
  -> atomically persist successful state
```

### Command layer

`src/commands/link.ts` registers the parent command, default reconcile action, init subcommand, options, user-facing logging, and exit behavior. It delegates domain work rather than containing filesystem traversal or reconciliation rules.

### Schema and configuration

`src/link/schema.ts` owns the Valibot configuration and persisted-state schemas plus their inferred types. `src/link/config.ts` loads YAML, reports readable path-aware validation errors, creates the init template, and updates `.gitignore`.

`scripts/gen-schema.ts` is extended to generate both the existing mass-exec schema and `ssv-links.config.schema.json`. Generated schema files are never edited manually.

### Discovery

`src/link/discovery.ts` discovers named descendant packages below each configured source root, stopping when it finds a package boundary and skipping expensive/generated directories. It also finds matching consumers in ordinary `node_modules` trees and pnpm's `.pnpm` virtual store, deduplicates paths, and excludes configured source roots located inside the consumer repository.

Discovery returns data only; it does not build, link, restore, or write state.

### Planning

`src/link/planner.ts` is a pure reconciliation layer. Given validated configuration, prior state, discovered packages, targets, and output availability, it emits an ordered plan containing warnings and actions such as:

- build a source root once;
- link a discovered package into a target;
- keep an already-correct link;
- restore a package removed from configuration;
- skip a missing package or missing output;
- reject an unsafe or conflicting target.

Stable sorting makes dry-run output and tests deterministic. Normal execution consumes exactly the plan shown by dry run, except that a successful build triggers a bounded output recheck before dependent link actions.

### Execution

`src/link/executor.ts` applies the plan and records successful results. `src/link/filesystem.ts` contains guarded symlink, backup, restore, ownership, and atomic-write operations. `src/link/build.ts` detects and runs one build per source root:

- `nx.json`: `pnpm nx run-many -t <target>`
- `turbo.json`: `pnpm turbo run <target>`
- matching root `package.json` script: `pnpm run <target>`
- otherwise: warn and leave packages with missing outputs unlinked

Builds run through execa with inherited output. `--no-build` plans warnings and skips missing-output packages without invoking processes.

## Reconciliation and Safety

- Consumer targets must resolve inside the selected consumer root. Source roots may be outside it.
- Traversal uses explicit depth limits and skips `node_modules`, `.git`, build output, cache, and coverage directories where appropriate.
- Existing targets are renamed to an SSV-specific backup before link creation.
- If link creation fails after backup, that individual target is restored immediately.
- Existing backups are never silently overwritten.
- A target is treated as SSV-owned only when its link destination matches the expected source recorded in state.
- Links not owned by SSV remain untouched and are reported as conflicts.
- Removing a package from the configuration and rerunning restores its backup.
- An empty `links` map is the explicit way to request restoration of all previously managed packages.
- Repeated runs converge without creating new backups or changing already-correct links.
- State records only successful link operations and retains entries that could not be safely restored.
- State is validated on read. Malformed or unsupported state fails closed instead of being discarded.
- State is written to a sibling temporary file and renamed into place so interrupted writes cannot leave partial JSON.
- Filesystem errors include the affected path, produce a nonzero result, and preserve enough state for a later run to converge.

The state schema includes a format version, package source paths, managed targets, backup paths, and timestamps. Persisted paths are absolute and normalized for reliable ownership checks on Windows and POSIX systems.

## Output and Errors

Use consola for structured start, info, warning, success, and error messages. Use `consola/utils` colors consistently with the rest of the CLI. User-facing names and labels are cyan, warnings yellow, errors red, secondary paths dim, and planned commands white.

Expected conditions such as an unknown configured package, unavailable source root, missing output under `--no-build`, or no consumers produce actionable warnings. Invalid configuration/state, unsafe paths, backup conflicts, failed builds required by link actions, failed restoration, or unrecovered filesystem errors cause a nonzero exit.

Dry-run output distinguishes planned builds, links, no-ops, skips, and restorations. It performs reads and validation but no process execution or writes, including no state or `.gitignore` changes.

## Testing

Add Vitest and coverage support with these scripts:

- `pnpm test`: one test run.
- `pnpm test:watch`: interactive watch mode.
- `pnpm test:coverage`: coverage for the new link modules.

Tests use temporary directories and never mutate the repository's actual `node_modules`.

### Unit coverage

- Valibot defaults, strict keys, package-name validation, state validation, and readable errors.
- Package discovery boundaries, depth limits, ignored directories, scoped/unscoped names, duplicates, and malformed manifests.
- Consumer discovery in ordinary and pnpm virtual-store layouts, exclusions, and deduplication.
- Pure planning for initial links, no-ops, changed configuration, removals, missing roots/packages/outputs, conflicts, and deterministic ordering.
- Build-strategy and command selection with process execution mocked.

### Filesystem integration coverage

- Initial backup and link creation.
- Idempotent reconciliation.
- Registry-target restoration after config removal.
- Failed-link rollback.
- Existing backup conflicts.
- Stale state and links that are not SSV-owned.
- Consumer-root path-boundary rejection.
- Atomic state writes.
- Windows junction and POSIX directory-symlink behavior through platform-aware assertions.

### CLI coverage

- Help and option registration.
- Missing configuration guidance.
- Init creation, idempotent `.gitignore` update, overwrite refusal, and `--force`.
- Dry-run output and absence of mutation.
- Success and failure exit behavior.

Coverage reporting targets the new link implementation. It does not impose artificial repository-wide thresholds on the existing untested `mass-exec` command.

## Documentation

- Update the root README with installation-neutral `ssv link` examples and a link to full reference documentation.
- Add `docs/link.md` covering configuration, options, reconciliation semantics, safety, builds, dry runs, and recovery guidance.
- Include the generated schema URL/path in the init template.
- Remove all Fabric-specific names and examples from production code and documentation; the POC remains an untracked reference and is not shipped.

## Verification

Implementation is complete only after fresh successful runs of:

```text
pnpm test
pnpm test:coverage
pnpm typecheck
pnpm lint
pnpm fmt:check
pnpm gen-schema
pnpm build
```

Also manually verify `ssv link --help`, `ssv link init` in a temporary repository, and `ssv link --dry-run` against a temporary pnpm-style fixture.
