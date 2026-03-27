# @ssv/cli

[![npm version](https://img.shields.io/npm/v/@ssv/cli.svg)](https://www.npmjs.com/package/@ssv/cli)
[![npm downloads](https://img.shields.io/npm/dm/@ssv/cli.svg)](https://www.npmjs.com/package/@ssv/cli)
[![GitHub license](https://img.shields.io/github/license/sketch7/ssv.cli)](https://github.com/sketch7/ssv.cli/blob/main/LICENSE)
[![GitHub issues](https://img.shields.io/github/issues/sketch7/ssv.cli)](https://github.com/sketch7/ssv.cli/issues)

`@ssv/cli` (`ssv`) — developer tooling CLI. Clone multiple git repos and run global + per-repo shell commands concurrently.

## Installation

```bash
# npm
npm install -g @ssv/cli

# pnpm
pnpm add -g @ssv/cli
```

## Getting Started

```bash
# 1. Configure workspace root, shell, and config directory interactively
ssv mass-exec setup

# 2. List available configs
ssv mass-exec list

# 3. Preview a run (dry-run)
ssv mass-exec ssv/tools --dry-run

# 4. Run it
ssv mass-exec ssv/tools
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

# Run a single config
ssv mass-exec ssv/tools

# Dry-run — preview commands without executing
ssv mass-exec ssv/tools --dry-run

# Filter to a single project within a config
ssv mass-exec ssv/tools --project ssv.cli

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
pnpm build && pnpm link --global
```
