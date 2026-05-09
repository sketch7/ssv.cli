# mass-exec — Full Reference

Clone a set of git repositories and run shell commands against each one — steps run per job, with optional per-project overrides — running concurrently. A Node.js replacement for the PowerShell `git-mass-commands.ps1` script.

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

### `mass-exec jobs <names...>`

List all jobs defined in one or more configs, including their steps and which job is the default.

```bash
ssv mass-exec jobs ssv/tools
ssv mass-exec jobs ssv
ssv mass-exec jobs all
```

Accepts the same name resolution as `run` (exact, prefix, or `all`).

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
| `--job <name>`       | `-j`  | Select a named job to run. When omitted, resolves via `defaultJob` → first job (convention).                                                                                        |                                       |
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

# Optional: name of the default job to run when --job is not specified.
# When omitted, the first job in the jobs list is used by convention.
defaultJob: setup

# Named jobs — each runs its steps on every project.
# Select with: ssv mass-exec <config> --job <name>
jobs:
  - name: setup
    description: Checkout, pull and prune branches
    steps:
      - name: git-checkout
        run: "git checkout {defaultBranch}"
      - name: git-pull
        run: git pull
      - name: git-prune-branches
        run: pnpx git-removed-branches --prune

  - name: build
    description: Install dependencies and build
    steps:
      - name: install
        run: pnpm i
      - name: build
        run: pnpm build

  - name: create-pr
    description: Create a pull request via GitHub CLI
    steps:
      - name: pr
        run: gh pr create --fill

projects:
  - name: ssv-core
    # Optional: overrides config-level cloneUrlTemplate for this project
    url: "https://github.com/{org}/{projectName}.git"
    # Optional: override clonePrefix for this project only
    clonePrefix: "@ssv"
    # Optional: override org for this project only
    org: sketch7
    # Optional: per-job overrides for this project
    jobs:
      - name: setup
        # Skip specific steps from the setup job for this project
        skipSteps:
          - git-prune-branches
      - name: build
        # Extra steps appended after the build job's steps for this project
        steps:
          - name: post-build
            run: npm run verify

  # url omitted — cloneUrlTemplate is used automatically
  - name: ssv-tools

  - name: legacy-project
    # Optional: override config-level vars for this project only
    vars:
      defaultBranch: master

  - name: app
    # Per-job overrides with extra steps for this project:
    jobs:
      - name: build
        steps:
          - name: restore
            run: npm install
          - name: lint
            run: npm run lint
            parallel: true
          - name: test
            run: npm test
            parallel: true
          - name: build-app
            run: npm run build
            needs: [restore]

```

### Top-level config fields

| Field              | Required | Description                                                                                                                                                                            |
| ------------------ | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `projects`         | ✓        | List of projects to process.                                                                                                                                                           |
| `jobs`             |          | Named jobs — each with a list of steps run on every project. Select at runtime with `--job <name>`. See [Jobs](#jobs).                                                                 |
| `defaultJob`       |          | Name of the job to run when `--job` is not specified. Falls back to the first job by convention when omitted.                                                                          |
| `cloneUrlTemplate` |          | Default clone URL template. Used when `project.url` is not set. Supports interpolation.                                                                                                |
| `org`              |          | Default org — fallback for `{org}` interpolation.                                                                                                                                      |
| `clonePrefix`      |          | Prefix prepended to the local clone folder name (e.g. `@ssv`).                                                                                                                         |
| `shell`            |          | Default shell for this config. Overridden by `--shell` flag. Valid values: `bash` \| `pwsh` \| `node` \| `sh` \| `cmd` \| `powershell`. Inherited by steps unless overridden per-step. |
| `wsRoot`           |          | Per-config workspace root. Supports `{wsRoot}` token (resolves from the global ws-root setting).                                                                                       |
| `concurrency`      |          | Number of projects to run concurrently. Overridden by `--concurrency` flag. Default: `5`.                                                                                              |
| `vars`             |          | Arbitrary key/value pairs — available in URL and step interpolation.                                                                                                                   |

### Project fields

| Field             | Required | Description                                                                                       |
| ----------------- | -------- | ------------------------------------------------------------------------------------------------- |
| `name`            | ✓        | Project name (used as clone folder name, and for `{projectName}` interpolation).                  |
| `url`             |          | Git clone URL. Overrides config-level `cloneUrlTemplate`. Supports interpolation.                 |
| `org`             |          | Per-project org override for `{org}` interpolation.                                               |
| `clonePrefix`     |          | Per-project clone prefix override.                                                                |
| `vars`            |          | Per-project variable overrides — merged over config-level `vars`.                                 |
| `jobs`            |          | Per-job overrides — list of `{ name, steps?, skipSteps? }`. `steps` are appended after the job's steps; `skipSteps` filters job steps by name. |

---

## Jobs

Jobs are named groups of steps run on every project. Each job has a name, an optional description, and a list of steps run on every project. Select a job at runtime with `--job <name>`.

```yaml
defaultJob: setup

jobs:
  - name: setup
    description: Checkout, pull and prune branches
    steps:
      - name: git-checkout
        run: "git checkout {defaultBranch}"
      - name: git-pull
        run: git pull
      - name: git-prune-branches
        run: pnpx git-removed-branches --prune

  - name: build
    description: Install dependencies and build
    steps:
      - name: install
        run: pnpm i
      - name: build
        run: pnpm build

  - name: create-pr
    description: Create a pull request via GitHub CLI
    steps:
      - name: pr
        run: gh pr create --fill
```

### Job fields

| Field         | Required | Description                                                                 |
| ------------- | -------- | --------------------------------------------------------------------------- |
| `name`        | ✓        | Job identifier. Used with `--job <name>` and `mass-exec jobs`.              |
| `description` |          | Human-readable description shown by `mass-exec jobs`.                       |
| `steps`       | ✓        | Steps to run for each project.                                               |

### Per-project job overrides

Each project can customise how a named job runs by adding a `jobs` list. Each entry matches a job by name and supports two overrides:

- **`skipSteps`** — names of steps from the job to skip for this project only
- **`steps`** — extra steps appended after the job's (filtered) steps for this project

```yaml
projects:
  - name: ssv-core
    jobs:
      - name: setup
        skipSteps:
          - git-prune-branches   # skip this step for ssv-core only
      - name: build
        steps:
          - name: post-build     # run this extra step after the build job's steps
            run: npm run verify
```

#### ProjectJobOverride fields

| Field       | Required | Description                                                                   |
| ----------- | -------- | ----------------------------------------------------------------------------- |
| `name`      | ✓        | Job name to match. Must correspond to a job defined in `jobs`.               |
| `skipSteps` |          | Names of steps from this job to skip for this project.                        |
| `steps`     |          | Additional steps appended after the job's (filtered) steps for this project.  |

---

### Per-project job overrides

Each project can customise how a named job runs by adding a `jobs` list. Each entry matches a job by name and supports:

- **`skipSteps`** — names of steps from the job to skip for this project only
- **`steps`** — extra steps appended after the job's (filtered) steps for this project

```yaml
projects:
  - name: ssv-core
    jobs:
      - name: setup
        skipSteps:
          - git-prune-branches   # skip this step for ssv-core only
      - name: build
        steps:
          - name: post-build     # run this extra step after the build job's steps
            run: npm run verify
```

#### ProjectJobOverride fields

| Field       | Required | Description                                                                  |
| ----------- | -------- | ---------------------------------------------------------------------------- |
| `name`      | ✓        | Job name to match. Must correspond to a job defined in `jobs`.              |
| `skipSteps` |          | Names of steps from this job to skip for this project.                       |
| `steps`     |          | Additional steps appended after the job's (filtered) steps for this project. |

---

### Default job resolution order

1. `--job <name>` CLI flag
2. `config.defaultJob` field
3. First job in the `jobs` array (convention)


---

## Step format

Both job `steps` and per-project job override `steps` use the same object shape:

```yaml
jobs:
  - name: build
    steps:
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
| `name`     | ✓        | Step identifier (used in `skipSteps`, `needs`, and progress output).                                                                                                                                                                                |
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
