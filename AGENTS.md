# ssv.cli — Agent Guidelines

`@ssv/cli` (bin: `ssv`) — developer tooling CLI. Currently ships one command: `mass-exec`, a Node.js replacement for a PowerShell `git-mass-commands.ps1` script that clones multiple git repos and runs global + per-repo shell commands concurrently.

## Commands

```bash
pnpm install          # Install dependencies
pnpm build            # Compile: tsdown → dist/cli.mjs
pnpm dev -- <args>    # Watch mode tsdown, e.g. pnpm dev -- mass-exec --help
pnpm start            # Run compiled CLI

pnpm typecheck        # tsc --noEmit
pnpm lint             # oxlint .
pnpm lint:fix         # oxlint --fix .
pnpm fmt              # oxfmt .
pnpm fmt:check        # oxfmt . --check

pnpm gen-schema       # Regenerate mass-exec.config.schema.json from config-schema.ts
```

There is no test suite/`test` script in this repo currently — verify changes via `pnpm typecheck`, `pnpm lint`, and manual runs (`pnpm dev -- mass-exec ...`).

> **After modifying `src/config-schema.ts`**, always run `pnpm gen-schema` to keep `mass-exec.config.schema.json` in sync — it is auto-generated, never edit it manually.

### Re-link after rebuilding

```bash
pnpm build && pnpm add -g .
```

> pnpm 11 removed `pnpm link --global` — `pnpm add -g .` is the replacement for making the `ssv` bin available globally.

## Architecture

```
src/
  cli.ts                  Entry point — Commander setup, --log-level, update-notifier, registers commands
  config-schema.ts        Valibot schemas + inferred TypeScript types (source of truth)
  config-discovery.ts     Scans a directory for .yaml/.yml config files; resolves display names
  interpolate.ts          {token} interpolation utilities
  settings.ts             Read/write ~/.ssv/config.json (ws-root, config-root)
  commands/
    mass-exec.ts           mass-exec command logic (clone, run, listr2 concurrency, dry-run)
scripts/
  gen-schema.ts            Converts Valibot schemas → JSON Schema (auto-generated output)
```

**Data flow:** `cli.ts` → registers `mass-exec` → `settings.ts` reads `~/.ssv/config.json` → `config-discovery.ts` finds config files → Valibot validates → `interpolate.ts` resolves `{tokens}` in URLs and commands → `execa` executes via `listr2` task runner.

**Execution model (`src/commands/mass-exec.ts`):** for each resolved config, each project runs a nested listr2 pipeline: Clone (skipped if already cloned or no URL) → Verify directory → the resolved job's steps. Steps within a job are grouped into "waves" by `buildStepWaves`: consecutive `parallel: true` steps become one concurrent wave, everything else runs sequentially. Job resolution order is `--job` flag → `config.defaultJob` → first job by convention (`resolveJob`).

## Key Conventions

### Module style

- **ESM only** — `import`/`export`, no CommonJS. Output is `.mjs`.
- Use `node:` prefix for built-ins: `import { readFileSync } from "node:fs"`.
- Use `import.meta.url` instead of `__dirname`.

### TypeScript

- Strict mode, ES2022 target, `verbatimModuleSyntax: true`.
- Derive types from schemas: `type Foo = v.InferOutput<typeof FooSchema>` — do **not** write separate interfaces that duplicate schema fields.
- Build with `tsdown`, not `tsc`.

### Schema (Valibot)

- Add `.pipe(v.description("…"))` to schema fields for IDE hints and JSON Schema output.
- After changing any schema, run `pnpm gen-schema` — `mass-exec.config.schema.json` is **auto-generated, never edit manually**.
- Config files use **YAML** (`.yaml` / `.yml`). JSON configs are not supported.
- Steps are defined as `StepSchema` objects: `{ name, run, needs?, parallel? }` — no shorthand form.
- `parallel: true` on consecutive steps groups them into a concurrent wave; non-parallel steps run sequentially.
- Use `normalizeStep(step)` to convert a `Step` to `NormalizedStep { name, run, needs, parallel }` inside commands.
- `jobs` define all project-wide steps; per-project overrides use `project.jobs[].skipSteps` (to skip a job's steps) and `project.jobs[].steps` (to append extra steps).

### Output colors (`consola/utils`)

Import via `import { colors } from "consola/utils"`. Never use `chalk`.

| Purpose               | Color                |
| --------------------- | -------------------- |
| Info / labels / names | `colors.cyan(...)`   |
| Warnings              | `colors.yellow(...)` |
| Errors                | `colors.red(...)`    |
| Secondary / dim text  | `colors.dim(...)`    |
| Command strings       | `colors.white(...)`  |
| Dry-run prefix        | `colors.yellow(...)` |

### Adding a new command

1. Create `src/commands/<name>.ts` with a `register<Name>Command(program: Command)` export.
2. Import and call it in `src/cli.ts`.
3. Add any new config schema to `src/config-schema.ts`, then run `pnpm gen-schema`.

## Toolchain

| Tool              | Role                                                                       |
| ----------------- | -------------------------------------------------------------------------- |
| `tsdown`          | TypeScript → ESM bundler (wraps Rolldown)                                  |
| `oxlint`          | Fast linter (`typeAware: true` — type-checked rules via `oxlint-tsgolint`) |
| `oxfmt`           | Rust-based formatter                                                       |
| `valibot`         | Runtime schema validation + type inference                                 |
| `consola`         | Logging (`consola.info/warn/error/success/fatal`)                          |
| `consola/utils`   | `colors` export — ANSI color helpers                                       |
| `listr2`          | Concurrent task runner with progress rendering                             |
| `execa`           | Shell command execution (`stdio: "pipe"`)                                  |
| `yaml`            | YAML config file parsing                                                   |
| `commander`       | CLI argument parsing                                                       |
| `update-notifier` | Non-blocking update check on each run                                      |

## Requirements

- **Node.js ≥ 24.14.0**
- **pnpm** (locked via `packageManager` field)

## Interpolation Tokens

Available in `url` and command strings in config files (`src/interpolate.ts`):

| Token           | Resolves to                                             |
| --------------- | ------------------------------------------------------- |
| `{projectName}` | Project name                                            |
| `{org}`         | `project.org` → `config.org` → `config.vars.org` → `""` |
| `{anyKey}`      | Any key in `config.vars`                                |

Unknown tokens are left as-is.

## Reference docs

- [docs/mass-exec.md](docs/mass-exec.md) — full reference for `mass-exec`: all CLI options, config file format, step schema, and interpolation tokens.
- `mass-exec.config.schema.json` — auto-generated JSON Schema for config file authoring/IDE validation. Regenerate with `pnpm gen-schema`, never hand-edit.
