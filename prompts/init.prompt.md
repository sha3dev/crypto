Read `AGENTS.md`, `ai/contract.json`, and the assistant-specific adapter in `ai/` before making any code changes.

Follow the project conventions from `@sha3/code-standards` strictly:

- obey blocking deterministic rules from `ai/contract.json`
- treat simplicity as mandatory: choose the smallest correct solution and avoid speculative abstractions or gratuitous indirection
- do not use simplicity as a reason to remove valid responsibility boundaries
- keep managed files read-only unless this task is explicitly a standards update
- preserve the scaffold structure and naming conventions
- add or update tests for behavior changes
- execute `npm run check` yourself before finishing
- if `npm run check` fails, fix the issues and rerun it until it passes

When you respond after implementation, include:

- changed files
- a short compliance checklist
- proof that `npm run check` passed

## Package Specification

- Goal:
- Public API:
- Runtime constraints:
- Required dependencies:
- Feature requirements:
