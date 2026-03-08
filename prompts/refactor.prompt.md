Read these files before making any implementation changes:

- `AGENTS.md`
- `ai/contract.json`
- `.code-standards/refactor-source/public-contract.json`
- `.code-standards/refactor-source/preservation.json`
- `.code-standards/refactor-source/analysis-summary.md`

Your job is to rewrite the project into the fresh scaffold under `src/` and `test/`.

Rules:

- preserve only the contracts explicitly marked for preservation
- use the snapshot under `.code-standards/refactor-source/latest/` as reference, not as a structure to copy blindly
- treat simplicity as mandatory: rebuild with the smallest correct design and avoid speculative abstractions or gratuitous indirection
- do not use simplicity as a reason to remove valid responsibility boundaries
- keep managed files read-only unless this task is explicitly a standards update
- follow naming, architecture, and class section conventions strictly
- execute `npm run check` yourself before finishing
- if `npm run check` fails, fix the issues and rerun it until it passes

Finish with:

- changed files
- preserved contracts checklist
- intentionally broken or non-preserved items, if any
- proof that `npm run check` passed
