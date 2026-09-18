# @ssv/cli

[![npm version](https://img.shields.io/npm/v/@ssv/cli.svg)](https://www.npmjs.com/package/@ssv/cli)
[![npm downloads](https://img.shields.io/npm/dm/@ssv/cli.svg)](https://www.npmjs.com/package/@ssv/cli)
[![GitHub license](https://img.shields.io/github/license/sketch7/ssv.cli)](https://github.com/sketch7/ssv.cli/blob/main/LICENSE)
[![GitHub issues](https://img.shields.io/github/issues/sketch7/ssv.cli)](https://github.com/sketch7/ssv.cli/issues)

`@ssv/cli` (`ssv`) — developer tooling CLI for local package linking and concurrent multi-repository commands.

## Installation

```bash
# npm
npm install -g @ssv/cli

# pnpm
pnpm add -g @ssv/cli
```

## Getting Started

### Link local libraries

```bash
# 1. Create a shared starter configuration
ssv link init

# 2. Add source roots and package names to .ssv-links.yaml

# 3. Preview the reconciliation
ssv link --dry-run

# 4. Link packages and restore packages removed from the config
ssv link
```

`ssv link` supports pnpm repositories, including consumers inside pnpm's virtual store. It backs up installed targets, links them to local package directories, and restores them when removed from the configuration. It does not modify package manifests or lockfiles.

> See [docs/link.md](docs/link.md) for configuration fields, build detection, safety, and recovery guidance.

### Run commands across repositories

```bash
# 1. Configure workspace root, shell, and config directory interactively
ssv mass-exec setup

# 2. List available configs
ssv mass-exec list

# 3. Preview a run (dry-run)
ssv mass-exec ssv/tools --dry-run

# 4. Run it (uses the default job)
ssv mass-exec ssv/tools

# 5. Run a specific job
ssv mass-exec ssv/tools --job build
```

## Configure

Run the interactive setup wizard to register your workspace root, shell, and config directory:

```bash
ssv mass-exec setup
```

Or set each value individually:

```bash
ssv mass-exec set ws-root S:/git
ssv mass-exec set shell bash
ssv mass-exec set config-root S:/git/my-resource/mass-exec
```

Settings are persisted to `~/.ssv/config.json`.

## mass-exec — Cheat Sheet

```bash
# List all available configs
ssv mass-exec list

# Run a single config (uses the default job)
ssv mass-exec ssv/tools

# Dry-run — preview commands without executing
ssv mass-exec ssv/tools --dry-run

# Filter to a single project within a config
ssv mass-exec ssv/tools --project ssv.cli

# Run a specific job
ssv mass-exec ssv/tools --job build

# List all jobs defined in a config
ssv mass-exec jobs ssv/tools

# Run multiple configs
ssv mass-exec ssv/tools ssv/arcane bssn/fe

# Run all configs under a prefix
ssv mass-exec ssv

# Run everything
ssv mass-exec all

# Override the clone root
ssv mass-exec ssv -r S:/git

# Override the shell
ssv mass-exec ssv/tools --shell bash

# Increase concurrency
ssv mass-exec all --concurrency 10

# Stream live output (debug log level)
ssv mass-exec ssv --log-level debug
```

> For full reference — all options, config file format, step schema, and interpolation tokens — see [docs/mass-exec.md](docs/mass-exec.md).

---

## Development

```bash
# Install dependencies
pnpm install

# Build (outputs to dist/)
pnpm build

# Run compiled CLI
pnpm start

# Watch mode
pnpm dev -- mass-exec list

# Type-check
pnpm typecheck

# Run tests once
pnpm test

# Run tests in watch mode
pnpm test:watch

# Run tests with V8 coverage
pnpm test:coverage

# Lint
pnpm lint

# Lint with auto-fix
pnpm lint:fix

# Format
pnpm fmt

# Check formatting without modifying
pnpm fmt:check

# Regenerate mass-exec.config.schema.json (run after editing src/config-schema.ts)
pnpm gen-schema
```

### Re-link after rebuilding

```bash
pnpm build && pnpm add -g .
```

> pnpm 11 removed `pnpm link --global` — `pnpm add -g .` is the replacement for making the `ssv` bin available globally.
