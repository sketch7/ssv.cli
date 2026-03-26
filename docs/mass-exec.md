# mass-exec — Full Reference

Clone a set of git repositories and run shell commands against each one — global steps (shared) and per-project steps — running concurrently. A Node.js replacement for the PowerShell `git-mass-commands.ps1` script.

```
ssv mass-exec <subcommand>
```

> **Global option — available on all commands:**
>
> `--log-level <level>` — set log verbosity: `silent` | `error` | `warn` | `info` | `debug` | `verbose` (default: `info`).
> Use `debug` or `verbose` to stream live command output instead of capturing it.

---

## Subcommands

### `mass-exec setup`

Interactive wizard to configure `ws-root`, `shell`, and `config-root` in one step. Pre-fills current values as defaults.

```bash
ssv mass-exec setup
```

---

### `mass-exec set <key> <value>`

Persist a setting. Available keys:

| Key           | Description                                                                                 |
| ------------- | ------------------------------------------------------------------------------------------- |
| `config-root` | Directory scanned for mass-exec config files                                                |
| `ws-root`     | Global workspace root — default dir for project clones                                      |
| `shell`       | Default shell for all configs (`bash` \| `pwsh` \| `node` \| `sh` \| `cmd` \| `powershell`) |

```bash
ssv mass-exec set config-root S:/git/my-resource/mass-exec
ssv mass-exec set ws-root S:/git
```

Settings are persisted to `~/.ssv/config.json`.

---

### `mass-exec list`

List all config files discovered in the registered directory.

```bash
ssv mass-exec list
```

Config names are derived from their path relative to the registered directory, without the `.yaml` / `.yml` extension. If the filename begins with the parent directory name followed by a dot, that redundant prefix is trimmed:

| File path (relative) | Config name  |
| -------------------- | ------------ |
| `ssv/ssv.tools.yaml` | `ssv/tools`  |
| `bssn/bssn.fe.yaml`  | `bssn/fe`    |
| `ssv/arcane.yaml`    | `ssv/arcane` |

---

### `mass-exec [run] <names...>`

Run one or more configs by name. `run` is the default subcommand and can be omitted.

```
ssv mass-exec [run] <names...> [options]
```

#### Options

| Option               | Alias | Description                                                                                                                                                                         | Default                               |
| -------------------- | ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------- |
| `--project <filter>` | `-p`  | Only process projects whose name contains this string (case-insensitive substring match).                                                                                           |                                       |
| `--root <path>`      | `-r`  | Override root directory where repositories are cloned. When omitted, uses the global `ws-root` setting (or `./` if not set).                                                        |                                       |
| `--shell <shell>`    | `-s`  | Shell to use for commands. Valid values: `bash` \| `pwsh` \| `node` \| `sh` \| `cmd` \| `powershell`. Resolution order: `--shell` → config `shell` → settings `shell` → OS default. | `powershell` on Windows, `sh` on Unix |
| `--dry-run`          | `-d`  | Preview all commands with their working directory via the progress renderer — nothing is executed.                                                                                  | `false`                               |
| `--concurrency <n>`  | `-c`  | Number of projects to process in parallel.                                                                                                                                          | `5`                                   |

#### Name resolution

| Input          | Resolves to                                                                       |
| -------------- | --------------------------------------------------------------------------------- |
| `ssv/tools`    | Single config — matched by name (case-insensitive), trimming prefix when matching |
| `ssv`          | All configs whose name starts with `ssv/` (prefix match)                          |
| `all`          | Every config in the registered directory                                          |
| Multiple names | All matched configs, deduplicated, in order given                                 |

---

## Config file format

Config files are **YAML** (`.yaml` or `.yml`). Point your editor at the JSON Schema for completions and validation:

```yaml
# yaml-language-server: $schema=https://raw.githubusercontent.com/sketch7/ssv.cli/refs/heads/v1/mass-exec.config.schema.json
$schema: "https://raw.githubusercontent.com/sketch7/ssv.cli/refs/heads/v1/mass-exec.config.schema.json"

# Optional: per-config workspace root (projects for this config are cloned here)
# Supports {wsRoot} token — resolves to the global ws-root setting
wsRoot: "{wsRoot}/bssn"

# Optional: prepended to the local clone folder name
clonePrefix: "@ssv"

# Optional: default shell for this config (overridden by --shell flag)
shell: powershell

# Optional: default org for {org} interpolation
org: sketch7

# Optional: default URL template for all projects (used when project.url is not set)
cloneUrlTemplate: "https://github.com/{org}/{projectName}.git"

# Optional: arbitrary variables available in URL and step interpolation
vars:
  baseUrl: "https://github.com"
  defaultBranch: main

# Optional: number of projects to run concurrently (overridden by --concurrency flag). Default: 5
concurrency: 3

projects:
  - name: ssv-core
    # Optional: overrides config-level cloneUrlTemplate for this project
    url: "https://github.com/{org}/{projectName}.git"
    # Optional: override clonePrefix for this project only
    clonePrefix: "@ssv"
    # Optional: override org for this project only
    org: sketch7
    # Optional: steps run after globalSteps for this project
    steps:
      - name: npm-install
        run: npm install
      - name: build
        run: npm run build
        needs: [npm-install]
    # Optional: skip specific globalSteps for this project
    skipGlobalSteps:
      - git-cleanup-branches

  # url omitted — cloneUrlTemplate is used automatically
  - name: ssv-tools

  - name: legacy-project
    # Optional: override config-level vars for this project only
    vars:
      defaultBranch: master

  - name: app
    # Steps with parallel grouping and needs-based ordering:
    steps:
      - name: restore
        run: npm install
      - name: lint
        run: npm run lint
        parallel: true
      - name: test
        run: npm test
        parallel: true
      - name: build
        run: npm run build
        needs: [restore]

# Optional: run for every project (skippable per project via skipGlobalSteps)
globalSteps:
  - name: git-checkout
    run: "git checkout {defaultBranch}"
  - name: git-pull
    run: git pull
  - name: git-fetch-prune
    run: git fetch --prune origin
  - name: git-cleanup-branches
    run: "git branch -vv | grep ': gone]' | awk '{print $1}' | xargs git branch -D"
```

### Top-level config fields

| Field              | Required | Description                                                                                                                                                                            |
| ------------------ | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `projects`         | ✓        | List of projects to process.                                                                                                                                                           |
| `globalSteps`      |          | Steps run for every project (filterable per project via `skipGlobalSteps`).                                                                                                            |
| `cloneUrlTemplate` |          | Default clone URL template. Used when `project.url` is not set. Supports interpolation.                                                                                                |
| `org`              |          | Default org — fallback for `{org}` interpolation.                                                                                                                                      |
| `clonePrefix`      |          | Prefix prepended to the local clone folder name (e.g. `@ssv`).                                                                                                                         |
| `shell`            |          | Default shell for this config. Overridden by `--shell` flag. Valid values: `bash` \| `pwsh` \| `node` \| `sh` \| `cmd` \| `powershell`. Inherited by steps unless overridden per-step. |
| `wsRoot`           |          | Per-config workspace root. Supports `{wsRoot}` token (resolves from the global ws-root setting).                                                                                       |
| `concurrency`      |          | Number of projects to run concurrently. Overridden by `--concurrency` flag. Default: `5`.                                                                                              |
| `vars`             |          | Arbitrary key/value pairs — available in URL and step interpolation.                                                                                                                   |

### Project fields

| Field             | Required | Description                                                                       |
| ----------------- | -------- | --------------------------------------------------------------------------------- |
| `name`            | ✓        | Project name (used as clone folder name, and for `{projectName}` interpolation).  |
| `url`             |          | Git clone URL. Overrides config-level `cloneUrlTemplate`. Supports interpolation. |
| `org`             |          | Per-project org override for `{org}` interpolation.                               |
| `clonePrefix`     |          | Per-project clone prefix override.                                                |
| `vars`            |          | Per-project variable overrides — merged over config-level `vars`.                 |
| `steps`           |          | Steps specific to this project, run after `globalSteps`.                          |
| `skipGlobalSteps` |          | Names of `globalSteps` entries to skip for this project.                          |

---

## Step format

Both `globalSteps` and `steps` use the same object shape:

```yaml
globalSteps:
  - name: restore
    run: pnpm install
  - name: lint
    run: pnpm lint
    parallel: true # grouped with adjacent parallel steps → run concurrently
  - name: typecheck
    run: pnpm typecheck
    parallel: true # same wave as lint
  - name: build
    run: pnpm build
    needs: [restore] # informational — documents intent
```

| Field      | Required | Description                                                                                                                                                                                                                                               |
| ---------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `name`     | ✓        | Step identifier (used in `skipGlobalSteps`, `needs`, and progress output).                                                                                                                                                                                |
| `run`      | ✓        | Shell expression. Supports interpolation tokens.                                                                                                                                                                                                          |
| `needs`    |          | Names of steps this step conceptually depends on (informational / documented).                                                                                                                                                                            |
| `parallel` |          | When `true`, groups this step with adjacent `parallel: true` steps into one concurrent wave. Default: `false`.                                                                                                                                            |
| `shell`    |          | Shell override for this step. Inherits from `--shell` → config `shell` → settings `shell`. Valid values: `bash` \| `pwsh` \| `node` \| `sh` \| `cmd` \| `powershell`. When `shell: node`, the `run` value is executed as inline JavaScript via `node -e`. |

---

## Interpolation tokens

Available in **both** `url` and command strings:

| Token           | Resolves to                                                          |
| --------------- | -------------------------------------------------------------------- |
| `{projectName}` | Project name (e.g. `ssv-core`)                                       |
| `{org}`         | `project.org` → `config.org` → `config.vars.org` → `""`              |
| `{wsRoot}`      | Global ws-root setting (used in per-config `wsRoot` field)           |
| `{anyKey}`      | Any key in `config.vars`, overridable per project via `project.vars` |

Unknown tokens are left as-is (e.g. `{unknown}` stays `{unknown}`).
