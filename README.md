# @ssv/toolz

@ssv developer tooling CLI.

## Requirements

- Node.js `>=24`
- pnpm

## Installation

### Global (recommended)

```bash
pnpm add -g @ssv/toolz
# or link from source after building:
pnpm build && pnpm link --global
```

### Local project

```bash
pnpm add -D @ssv/toolz
```

---

## Commands

### `mass-exec`

Clone a set of git repositories and run commands against each one — global commands (shared across all repos) and per-repo commands. A Node.js replacement for the PowerShell `git-mass-commands.ps1` script.

```
ssv-toolz mass-exec [options]
```

| Option            | Alias | Description                                                                                    | Default                               |
| ----------------- | ----- | ---------------------------------------------------------------------------------------------- | ------------------------------------- |
| `--config <file>` | `-c`  | Config file path. Repeatable — pass multiple times to process several configs in sequence.     | _(required)_                          |
| `--root <path>`   | `-r`  | Root directory where repositories are cloned into. Created automatically if it does not exist. | `./`                                  |
| `--shell <shell>` | `-s`  | Shell used to execute commands (`powershell`, `pwsh`, `bash`, `sh`, …).                        | `powershell` on Windows, `sh` on Unix |
| `--dry-run`       | `-d`  | Print all commands with their working directory without executing anything.                    | `false`                               |

#### Examples

```bash
# Single config, dry-run to preview
ssv-toolz mass-exec -c ../../powershell/git-mass-commands/ssv/ssv.arcane.config.json -r S:/toolz-test --dry-run
ssv-toolz mass-exec -c ./mass-exec-cfgs/ssv.tools.config.json -r S:/toolz-test --dry-run

# Clone + run with a specific shell
ssv-toolz mass-exec -c ./ssv/ssv.core.config.json -r S:/git --shell bash

# Process multiple configs in sequence (replaces @ssv.all.ps1)
ssv-toolz mass-exec \
  -c ./ssv/ssv.core.config.json \
  -c ./ssv/ssv.arcane.config.json \
  -c ./ssv/ssv.ngx-apps.config.json \
  -r S:/git

# Configs live next to the repos root
ssv-toolz mass-exec -c /path/to/configs/my.config.json -r ./workspace
```

---

## Config file format

Fully backward-compatible with the original PowerShell `*.config.json` schema.

```jsonc
{
  "$schema": "node_modules/@ssv/toolz/mass-exec.config.schema.json",

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
pnpm dev -- mass-exec --help

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
