# Plan: mass-exec Config Registry

## TL;DR
Add a persistent config-directory registry (`~/.ssv/config.json`) to `mass-exec`. Users register a
directory once via `mass-exec set <path>`; configs are auto-discovered by relative path
(e.g., `ssv/ssv-tools.json` → name `ssv/ssv-tools`). The old `-c` flag is removed, replaced by
named subcommands: `set`, `list`, and a default variadic `run <names...>` that supports exact match,
prefix wildcard, `all`, and multiple space-separated names.

---

## Decisions
- Storage: `~/.ssv/config.json` (user home via `os.homedir()`)
- Name resolution: hierarchical — relative path from dir minus `.json`, forward slashes (e.g., `ssv/ssv-tools`)
- One global directory only
- `--repo` filter: case-insensitive substring match, applied per config
- Legacy `-c/--config` flag removed entirely
- `run` is the default Commander subcommand (so `ssv mass-exec ssv/ssv-tools` routes there automatically)
- Multi-name: variadic space-separated args (`ssv/tools ssv/arcane bssn/fe`)
- Prefix match: `ssv` (no exact match) → all configs whose name starts with `ssv/`
- Special name `all` → all discovered configs
- Dedup across resolved names, preserve order

---

## Usage (post-implementation)

```sh
ssv mass-exec set S:/git/sketch7.resource/mass-exec   # register dir
ssv mass-exec list                                     # list all configs
ssv mass-exec ssv/ssv-tools                            # single exact
ssv mass-exec ssv/ssv-tools ssv/arcane bssn/fe         # multi
ssv mass-exec ssv                                      # prefix → all ssv/*
ssv mass-exec all                                      # all discovered
ssv mass-exec ssv/ssv-tools --repo ssv.cli             # filter repos
ssv mass-exec ssv --dry-run                            # dry-run
