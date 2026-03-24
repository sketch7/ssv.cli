# @ssv/cli

@ssv developer tooling CLI.

## Requirements

- Node.js `>=24`
- pnpm

## Installation

### Global (recommended)

```bash
pnpm add -g @ssv/cli
# or link from source after building:
pnpm build && pnpm link --global
```

### Local project

```bash
pnpm add -D @ssv/cli
```

---

## Commands

> **Global option — available on all commands:**
>
> `--log-level <level>` — set log verbosity: `silent` | `error` | `warn` | `info` | `debug` | `verbose` (default: `info`).
> Use `debug` or `verbose` to stream live command output instead of capturing it.

### `mass-exec`

Clone a set of git repositories and run commands against each one — global commands (shared across all projects) and per-project commands. A Node.js replacement for the PowerShell `git-mass-commands.ps1` script.

```
ssv mass-exec <subcommand>
```

#### `mass-exec set <key> <value>`

Persist a setting. Available keys:

| Key           | Description                                            |
| ------------- | ------------------------------------------------------ |
| `config-root` | Directory scanned for mass-exec config files           |
| `ws-root`     | Global workspace root — default dir for project clones |

```bash
ssv mass-exec set config-root S:/git/sketch7.resource/mass-exec
ssv mass-exec set ws-root S:/git
```

Settings are persisted to `~/.ssv/config.json`.

---

#### `mass-exec setup`

Interactive wizard to configure `ws-root` and `config-root` in one step. Prefills current values as defaults.

```bash
ssv mass-exec setup
```

---

#### `mass-exec list`

List all config files discovered in the registered directory.

```bash
ssv mass-exec list
```

Config names are derived from their path relative to the registered directory, without the `.json` extension. If the filename begins with the parent directory name followed by a dot, that redundant prefix is trimmed:

| File path (relative) | Config name  |
| -------------------- | ------------ |
| `ssv/ssv.tools.json` | `ssv/tools`  |
| `bssn/bssn.fe.json`  | `bssn/fe`    |
| `ssv/arcane.json`    | `ssv/arcane` |

---

#### `mass-exec [run] <names...>`

Run one or more configs by name. `run` is the default subcommand and can be omitted.

```
ssv mass-exec [run] <names...> [options]
```

| Option               | Alias | Description                                                                                                                  | Default                               |
| -------------------- | ----- | ---------------------------------------------------------------------------------------------------------------------------- | ------------------------------------- |
| `--project <filter>` |       | Only process projects whose name contains this string (case-insensitive substring match).                                    |                                       |
| `--root <path>`      | `-r`  | Override root directory where repositories are cloned. When omitted, uses the global `ws-root` setting (or `./` if not set). |                                       |
| `--shell <shell>`    | `-s`  | Shell used to execute commands (`powershell`, `pwsh`, `bash`, `sh`, …).                                                      | `powershell` on Windows, `sh` on Unix |
| `--dry-run`          | `-d`  | Preview all commands with their working directory via the progress renderer — nothing is executed.                           | `false`                               |
| `--concurrency <n>`  | `-c`  | Number of projects to process in parallel.                                                                                   | `5`                                   |

**Name resolution:**

| Input          | Resolves to                                                                      |
| -------------- | -------------------------------------------------------------------------------- |
| `ssv/tools`    | Single config — matched by name (case-insensitive) trimming prefix when matching |
| `ssv`          | All configs whose name starts with `ssv/` (prefix match)                         |
| `all`          | Every config in the registered directory                                         |
| Multiple names | All matched configs, deduplicated, in order given                                |

#### Examples

```bash
# Register config directory and workspace root
ssv mass-exec set config-root S:/git/sketch7.resource/mass-exec
ssv mass-exec set ws-root S:/git

# Or configure both interactively
ssv mass-exec setup

# List all available configs
ssv mass-exec list

# Run a single config (dry-run to preview)
ssv mass-exec ssv/tools --dry-run

# Run a single config against a specific project
ssv mass-exec ssv/tools --project ssv.cli

# Run multiple configs
ssv mass-exec ssv/tools ssv/arcane bssn/fe

# Run all configs under the ssv/ prefix
ssv mass-exec ssv

# Run everything
ssv mass-exec all

# Run all ssv/* configs into a custom root, dry-run
ssv mass-exec ssv -r S:/git --dry-run

# Run bssn configs — wsRoot resolved from global ws-root setting
ssv mass-exec bssn

# Override shell
ssv mass-exec ssv/tools --shell bash

# Run 10 projects concurrently
ssv mass-exec all --concurrency 10

# Preview with verbose output (streams each command's output live)
ssv mass-exec ssv --dry-run --log-level debug
```

---

## Config file format

Fully backward-compatible with the original PowerShell `*.config.json` schema.

```jsonc
{
  "$schema": "node_modules/@ssv/cli/mass-exec.config.schema.json",

  // Optional: per-config workspace root (projects for this config are cloned here)
  // Supports {wsRoot} token — resolves to the global ws-root setting
  "wsRoot": "{wsRoot}/bssn",

  // Optional: prepended to the local clone folder name
  "clonePrefix": "@ssv",

  // Optional: default shell for this config (overridden by --shell flag)
  "shell": "powershell",

  // Optional: default org for {org} interpolation
  "org": "sketch7",

  // Optional: default URL template for all projects (used when project.url is not set)
  "cloneUrlTemplate": "https://github.com/{org}/{projectName}.git",

  // Optional: arbitrary variables available in URL and command interpolation
  "vars": {
    "baseUrl": "https://github.com",
    "defaultBranch": "main",
  },

  // Optional: number of projects to run concurrently (overridden by --concurrency flag). Default: 5
  "concurrency": 3,

  // Optional: run globalCommands and project commands concurrently within each project.
  // When true, commands with no `needs` dependencies run in parallel.
  // Default: false (sequential)
  "parallelCommands": false,

  "projects": [
    {
      "name": "ssv-core",

      // Optional: overrides config-level cloneUrlTemplate for this project
      "url": "https://github.com/{org}/{projectName}.git",

      // Optional: override clonePrefix for this project only
      "clonePrefix": "@ssv",

      // Optional: override org for this project only
      "org": "sketch7",

      // Optional: override parallelCommands for this project only
      "parallelCommands": true,

      // Optional: commands run after globalCommands for this project.
      // Shorthand form (backward-compatible):
      "commands": [{ "npm-install": "npm install" }, { "build": "npm run build" }],

      // Optional: skip specific globalCommands for this project
      "skipGlobalCommands": ["git-cleanup-branches"],
    },
    {
      // url omitted — cloneUrlTemplate is used automatically
      "name": "ssv-tools",
    },
    {
      "name": "legacy-project",

      // Optional: override config-level vars for this project only
      "vars": {
        "defaultBranch": "master",
      },
    },
    {
      "name": "app",
      // Rich command form with `needs` for dependency ordering:
      "commands": [
        { "name": "install", "run": "npm install" },
        { "name": "build", "run": "npm run build", "needs": ["install"] },
        { "name": "test", "run": "npm test", "needs": ["build"] },
        // lint can run in parallel with test (both depend only on build)
        { "name": "lint", "run": "npm run lint", "needs": ["build"] },
      ],
    },
  ],

  // Optional: run for every project (skippable per project via skipGlobalCommands)
  "globalCommands": [
    { "git-checkout": "git checkout {defaultBranch}" },
    { "git-pull": "git pull" },
    { "git-fetch-prune": "git fetch --prune origin" },
    { "git-cleanup-branches": "git branch -vv | grep ': gone]' | awk '{print $1}' | xargs git branch -D" },
  ],
}
```

### Command formats

Both `globalCommands` and `commands` accept two formats that can be mixed:

**Shorthand** — backward-compatible single-key record:

```jsonc
{ "git-pull": "git pull" }
```

**Rich object** — enables `needs` for dependency ordering:

```jsonc
{ "name": "build", "run": "npm run build", "needs": ["install"] }
```

| Field   | Required | Description                                              |
| ------- | -------- | -------------------------------------------------------- |
| `name`  | ✓        | Command identifier (used in `needs` and progress output) |
| `run`   | ✓        | Shell expression. Supports interpolation tokens.         |
| `needs` |          | Names of commands that must complete before this one.    |

When `parallelCommands: true`, commands whose `needs` are already satisfied run concurrently within the same wave. Circular dependencies are detected at runtime and reported as a fatal error.

### Interpolation tokens

Available in **both** `url` and command strings:

| Token           | Resolves to                                                          |
| --------------- | -------------------------------------------------------------------- |
| `{projectName}` | Project name (e.g. `ssv-core`)                                       |
| `{org}`         | `project.org` → `config.org` → `config.vars.org` → `""`              |
| `{wsRoot}`      | Global ws-root setting (used in per-config `wsRoot` field)           |
| `{anyKey}`      | Any key in `config.vars`, overridable per project via `project.vars` |

Unknown tokens are left as-is (e.g. `{unknown}` stays `{unknown}`).

---

## Development

```bash
# Install dependencies
pnpm install

# Build (outputs to dist/)
pnpm build

# Run compiled CLI
pnpm start

# Watch mode (runs via tsx, no build step)
pnpm dev -- mass-exec list

# Type-check
pnpm typecheck

# Lint
pnpm lint

# Lint with auto-fix
pnpm lint:fix

# Format
pnpm format

# Check formatting without modifying
pnpm format:check

# Regenerate mass-exec.config.schema.json (run after editing src/config-schema.ts)
pnpm gen-schema
```

### Re-link after rebuilding

```bash
pnpm build && pnpm link --global
```
