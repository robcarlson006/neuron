# Neuron 4.18.0 stability verification

Baseline: `76817ee` / v4.17.3. Release branch: `codex/neuron-stability-4-17`.

## Changes verified

- Class Order persistence is isolated in `MaterialCurriculumService`; ownership, ordering, metadata-only reads, transactional moves, and zero-selection semantics are covered.
- Tutor turns now have durable main-process lifecycle rows and canonical assistant persistence. Guided material retrieval is restricted to the active material.
- Folder watching uses injectable dependencies and deterministic cleanup, removing the host-dependent `EMFILE` unit-test failure.
- React Router future flags, the missing curriculum API mock, static class-handler imports, and ESM PostCSS configuration remove the confirmed build/test warnings.
- Additive tables exist for answer evidence, finalization operations, and focus-block runtime recovery.

## Commands and results

| Command | Result |
| --- | --- |
| `npm run typecheck` | pass |
| `npm run compile` | pass; no Vite/PostCSS warnings |
| `npm test -- --runInBand` | 94 passed suites, 1 skipped suite; 861 passed tests, 1 skipped test |
| `npx jest tests/unit/folderSyncService.test.ts --runInBand` | 19/19 passed |
| `git diff --check` | pass |

The one skipped tutor-turn test is explicitly skipped because the installed `better-sqlite3` native binary is x86_64 while this Apple Silicon host is ARM64. It must run in the release CI/native environment after dependencies are installed for that architecture.

## Known limitations

- Native Electron Playwright launch was not available in the restricted GUI sandbox; the prior attempt aborted with `SIGABRT` before the first window. This is recorded as an environment limitation, not an application pass.
- Full finalization-operation recovery, focus-block command handlers, and synthetic native E2E journeys remain follow-up work; the additive schema is in place so those migrations are forward-compatible.
- Expected corrupt-PDF/OCR fixture warnings remain visible in Jest output; they are test-fixture diagnostics, not unexpected failures.

## Rollback

Revert the release commit and restore the previous application bundle. The schema additions are additive and unused by older binaries; no destructive migration is required.
