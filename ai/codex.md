# Codex Adapter

- Read `AGENTS.md` and `ai/contract.json` before implementation.
- Treat deterministic rules from `ai/contract.json` as blocking.
- Keep `@sha3/code-standards` managed files read-only unless the user explicitly requests a standards update.
- Run `npm run check` before finalizing and fix any failing rule or type error.
