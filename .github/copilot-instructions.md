# Copilot instructions

- Start with the exact file, symbol, or component named in the request.
- Search filenames and symbols before opening additional files; read only relevant sections and necessary dependencies.
- Reuse `CODEBASE_MAP.md` and reliable conversation context. Do not scan the whole repository for routine changes.
- Avoid repeated searches, unnecessary file reads, broad refactoring, and unrelated edits.
- Follow dependencies only as needed to make a correct change.
- Run targeted tests and report actual results; do not claim tests passed unless they were run.
- Update `CODEBASE_MAP.md` only when architecture or dependencies change meaningfully.
