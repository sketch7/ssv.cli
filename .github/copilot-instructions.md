# @ssv/cli — Copilot Instructions

`@ssv/cli` (bin: `ssv`) — developer tooling CLI. Currently ships one command: `mass-exec`, a Node.js replacement for the PowerShell `git-mass-commands.ps1` script that clones multiple git repos and runs global + per-repo shell commands concurrently.

## Build & Dev Commands

```bash
pnpm install          # Install dependencies
pnpm build            # Compile: tsdown → dist/cli.mjs
pnpm dev -- <args>    # Watch mode tsdown, e.g. pnpm dev -- mass-exec --help
pnpm start            # Run compiled CLI

pnpm typecheck        # tsc --noEmit
pnpm lint             # oxlint .
pnpm lint:fix         # oxlint --fix .
pnpm fmt           # oxfmt .
pnpm fmt:check     # oxfmt . --check

pnpm gen-schema       # Regenerate mass-exec.config.schema.json from config-schema.ts
```

> **After modifying `src/config-schema.ts`**, always run `pnpm gen-schema` to keep `mass-exec.config.schema.json` in sync.

## Architecture

```
src/
  cli.ts                  Entry point — Commander setup, --log-level, update-notifier, registers commands
  config-schema.ts        Valibot schemas + inferred TypeScript types (source of truth)
  config-discovery.ts     Scans a directory for .json config files; resolves display names
  interpolate.ts          {token} interpolation utilities
  settings.ts             Read/write ~/.ssv/config.json (ws-root, config-root)
  commands/
    mass-exec.ts          mass-exec command logic (clone, run, listr2 concurrency, dry-run)
scripts/
  gen-schema.ts           Converts Valibot schemas → JSON Schema (auto-generated output)
```

**Data flow:** `cli.ts` → registers `mass-exec` → `settings.ts` reads `~/.ssv/config.json` → `config-discovery.ts` finds config files → Valibot validates → `interpolate.ts` resolves `{tokens}` in URLs and commands → `execa` executes via `listr2` task runner.

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
- `CommandEntry` is a **union** of two shapes:
  - Shorthand: `{ "build": "npm run build" }` — single-key record, backward-compatible.
  - Rich object: `{ name: "build", run: "npm run build", needs?: ["install"] }` — supports dependency ordering.
- Use `normalizeCommand(entry)` to convert either shape to `NormalizedCommand { name, run, needs }` inside commands.

### Output colors (`consola/utils`)

Import via `import { colors } from "consola/utils"`. Never use `chalk`.

| Purpose                   | Color                |
| ------------------------- | -------------------- |
| Info / labels / names     | `colors.cyan(...)`   |
| Warnings                  | `colors.yellow(...)` |
| Errors                    | `colors.red(...)`    |
| Secondary / dim text      | `colors.dim(...)`    |
| Command strings           | `colors.white(...)`  |
| Dry-run prefix            | `colors.yellow(...)`  |

### Adding a new command

1. Create `src/commands/<name>.ts` with a `register<Name>Command(program: Command)` export.
2. Import and call it in `src/cli.ts`.
3. Add any new config schema to `src/config-schema.ts`, then run `pnpm gen-schema`.

## Toolchain

| Tool               | Role                                            |
| ------------------ | ----------------------------------------------- |
| `tsdown`           | TypeScript → ESM bundler (wraps Rolldown)       |
| `tsx`              | TypeScript runner / watcher (dev only)          |
| `oxlint`           | Fast linter                                     |
| `oxfmt`            | Rust-based formatter                            |
| `valibot`          | Runtime schema validation + type inference      |
| `consola`          | Logging (`consola.info/warn/error/success/fatal`) |
| `consola/utils`    | `colors` export — ANSI color helpers            |
| `listr2`           | Concurrent task runner with progress rendering  |
| `execa`            | Shell command execution (`stdio: "pipe"`)       |
| `commander`        | CLI argument parsing                            |
| `update-notifier`  | Non-blocking update check on each run           |

## Requirements

- **Node.js ≥ 24.14.0**
- **pnpm** (locked via `packageManager` field)

## Interpolation Tokens

Available in `url` and command strings in config files:

| Token           | Resolves to                                             |
| --------------- | ------------------------------------------------------- |
| `{projectName}` | Project name                                            |
| `{org}`         | `project.org` → `config.org` → `config.vars.org` → `""` |
| `{anyKey}`      | Any key in `config.vars`                                |

Unknown tokens are left as-is.
