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

### `mass-exec`

Clone a set of git repositories and run commands against each one — global commands (shared across all repos) and per-repo commands. A Node.js replacement for the PowerShell `git-mass-commands.ps1` script.

```
ssv mass-exec <subcommand>
```

#### `mass-exec set <path>`

Register the directory that contains your mass-exec config files. Only needs to be run once per machine.

```bash
ssv mass-exec set S:/git/sketch7.resource/mass-exec
```

The path is persisted to `~/.ssv/config.json`.

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

| Option            | Alias | Description                                                                                    | Default                               |
| ----------------- | ----- | ---------------------------------------------------------------------------------------------- | ------------------------------------- |
| `--repo <filter>` |       | Only process repos whose name contains this string (case-insensitive substring match).         |                                       |
| `--root <path>`   | `-r`  | Root directory where repositories are cloned into. Created automatically if it does not exist. | `./`                                  |
| `--shell <shell>` | `-s`  | Shell used to execute commands (`powershell`, `pwsh`, `bash`, `sh`, …).                        | `powershell` on Windows, `sh` on Unix |
| `--dry-run`       | `-d`  | Print all commands with their working directory without executing anything.                    | `false`                               |

**Name resolution:**

| Input          | Resolves to                                                                      |
| -------------- | -------------------------------------------------------------------------------- |
| `ssv/tools`    | Single config — matched by name (case-insensitive) trimming prefix when matching |
| `ssv`          | All configs whose name starts with `ssv/` (prefix match)                         |
| `all`          | Every config in the registered directory                                         |
| Multiple names | All matched configs, deduplicated, in order given                                |

#### Examples

```bash
# Register config directory once
ssv mass-exec set S:/git/sketch7.resource/mass-exec

# List all available configs
ssv mass-exec list

# Run a single config (dry-run to preview)
ssv mass-exec ssv/tools --dry-run

# Run a single config against a specific repo
ssv mass-exec ssv/tools --repo ssv.cli

# Run multiple configs
ssv mass-exec ssv/tools ssv/arcane bssn/fe

# Run all configs under the ssv/ prefix
ssv mass-exec ssv

# Run everything
ssv mass-exec all

# Run all ssv/* configs into a custom root, dry-run
ssv mass-exec ssv -r S:/git --dry-run

# Override shell
ssv mass-exec ssv/tools --shell bash
```

---

## Config file format

Fully backward-compatible with the original PowerShell `*.config.json` schema.

```jsonc
{
  "$schema": "node_modules/@ssv/cli/mass-exec.config.schema.json",

  // Optional: prepended to the local clone folder name
  "clonePrefix": "@ssv",

  // Optional: default shell for this config (overridden by --shell flag)
  "shell": "powershell",

  // Optional: default org for {{org}} interpolation
  "org": "sketch7",

  // Optional: default URL template for all repos (used when repo.url is not set)
  "repoUrlTemplate": "https://github.com/{{org}}/{{repo.name}}.git",

  // Optional: arbitrary variables available in URL and command interpolation
  "vars": {
    "baseUrl": "https://github.com",
  },

  "repos": [
    {
      "name": "ssv-core",

      // Optional: overrides config-level repoUrlTemplate for this repo
      "url": "https://github.com/{{org}}/{{repo.name}}.git",

      // Optional: override clonePrefix for this repo only
      "clonePrefix": "@ssv",

      // Optional: override org for this repo only
      "org": "sketch7",

      // Optional: commands run after globalCommands for this repo
      "commands": [{ "npm-install": "npm install" }, { "build": "npm run build" }],

      // Optional: skip specific globalCommands for this repo
      "skipGlobalCommands": ["git-cleanup-branches"],
    },
    {
      // url omitted — repoUrlTemplate is used automatically
      "name": "ssv-tools",
    },
  ],

  // Optional: run for every repo (skippable per repo via skipGlobalCommands)
  "globalCommands": [
    { "git-checkout": "git checkout main" },
    { "git-pull": "git pull" },
    { "git-fetch-prune": "git fetch --prune origin" },
    { "git-cleanup-branches": "git branch -vv | grep ': gone]' | awk '{print $1}' | xargs git branch -D" },
  ],
}
```

### Interpolation tokens

Available in **both** `url` and command strings:

| Token             | Resolves to                                          |
| ----------------- | ---------------------------------------------------- |
| `{{repo.name}}`   | Repository name (e.g. `ssv-core`)                    |
| `{{projectName}}` | Alias for `{{repo.name}}`                            |
| `{{org}}`         | `repo.org` → `config.org` → `config.vars.org` → `""` |
| `{{anyKey}}`      | Any key defined in `config.vars`                     |

Unknown tokens are left as-is (e.g. `{{unknown}}` stays `{{unknown}}`).

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
