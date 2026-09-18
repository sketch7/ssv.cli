# link — Full Reference

Link selected packages from local pnpm source repositories into every matching consumer location in another repository. This creates a reversible local `node_modules` overlay without changing manifests, workspaces, or lockfiles.

```text
ssv link [options]
```

## Initialize

Create a starter configuration in the current directory:

```bash
ssv link init
```

Target another repository or replace an existing configuration:

```bash
ssv link init --root S:/git/my-app
ssv link init --root S:/git/my-app --force
```

Initialization creates `.ssv-links.yaml`. It also adds `.ssv-links.state.json` and `*.ssv-registry-backup` to `.gitignore`. The YAML configuration is intentionally not ignored so a team can share its source-root and package definitions. State and backups are machine-local.

## Configure

```yaml
# yaml-language-server: $schema=https://raw.githubusercontent.com/sketch7/ssv.cli/refs/heads/v1/ssv-links.config.schema.json
$schema: "https://raw.githubusercontent.com/sketch7/ssv.cli/refs/heads/v1/ssv-links.config.schema.json"

links:
  ../sketch7.arcane.ngx:
    packages:
      - "@arcane/ngx.store"
    build: build
    output: dist
```

Each key under `links` is a source workspace root. Relative paths resolve from the consumer repository selected by `--root`; absolute paths are also accepted.

| Field      | Required | Default | Description                                                                                    |
| ---------- | -------- | ------- | ---------------------------------------------------------------------------------------------- |
| `packages` |          | `[]`    | Full npm package names discovered below this source root.                                      |
| `build`    |          | `build` | Nx target, Turbo task, or root `package.json` script used when a package output is missing.    |
| `output`   |          | `dist`  | Package-relative path that must exist before the package is linked, such as `dist` or `build`. |

Unknown configuration fields and invalid package names fail validation with field-path diagnostics.

## Reconcile

```bash
ssv link
```

The current working directory is the consumer repository by default. The command:

1. Loads `.ssv-links.yaml` and machine-local state.
2. Discovers the configured packages below each source root.
3. Finds every matching consumer under ordinary `node_modules` directories and pnpm's `.pnpm` virtual store.
4. Builds source workspaces whose configured package output is missing.
5. Backs up registry-installed targets and replaces them with links to local package directories.
6. Restores packages removed from the configuration.
7. Atomically persists successful reconciliation state.

Repeated runs are idempotent. Existing links are kept when they already point at the configured source.

### Options

| Option            | Alias | Description                                                                              |
| ----------------- | ----- | ---------------------------------------------------------------------------------------- |
| `--root <path>`   | `-r`  | Consumer repository root. Defaults to the current directory.                             |
| `--config <path>` |       | Configuration path. Relative paths resolve from `--root`. Defaults to `.ssv-links.yaml`. |
| `--no-build`      |       | Do not build missing outputs; warn and skip those packages.                              |
| `--dry-run`       | `-d`  | Validate and discover, then print the ordered plan without processes or writes.          |

Examples:

```bash
# Preview the exact plan
ssv link --dry-run

# Reconcile a different consumer repository
ssv link --root S:/git/my-app

# Use another config file under that root
ssv link --root S:/git/my-app --config config/local-links.yaml

# Only link packages whose configured outputs already exist
ssv link --no-build
```

## Build detection

When a selected package's configured output is absent, `ssv link` chooses one whole-workspace build strategy per source root:

1. `nx.json`: `pnpm nx run-many -t <build>`
2. `turbo.json`: `pnpm turbo run <build>`
3. Matching root script: `pnpm run <build>`

If no strategy matches or the build fails, dependent packages remain unlinked and the command exits unsuccessfully. Pass `--no-build` to skip process execution intentionally.

## Restoration and recovery

Remove or comment a package from `.ssv-links.yaml`, then rerun `ssv link`. SSV removes only links that still point at the source recorded in its state and restores their `.ssv-registry-backup` targets.

To restore every managed package, keep the config file and set an empty map:

```yaml
links: {}
```

Do not delete `.ssv-links.state.json` while links are active; it records ownership and restoration targets. SSV refuses to replace unrelated links or overwrite an existing backup conflict. If a backup is unavailable, run `pnpm install` in the consumer repository to restore its dependency tree.

All consumer mutations are guarded to remain under the selected repository root. Source roots may be outside that boundary because they are read and built, not rewritten by the linking operation.
