# Milestone completion Phase 1 — 1 November 2026

Implemented additive official-result facts, captured comparison semantics and
historical target precedence. Manual result capture previews the projected
milestone before confirming its result, explicit relationship and image state
in the milestone transaction. Existing targeted history writes use that same
transaction. Reads and previews do not repair or backfill records.

Home provides a link to the selected milestone's Settings result editor. The
editor offers existing saved results, keeps activity measurements separate from
confirmed official facts and uses a stable achievement ID. Confirmed writes
refresh milestone and image views; open Home details resolve current sources.

Verification:

- Web TypeScript check passes.
- Seven focused test files pass: core completion, timeline and Home selection;
  web milestone state/images; SQLite history and PGlite PostgreSQL history.
- Two real browser/API regressions pass: read-only preview, confirm, replay
  conflict and reload; and the full editor review/confirmation flow.
- Home browser suite: six pass; prototype geometry comparison fails at 1.203125
  pixels against its one-pixel height tolerance.
- Broad core suite also has an unrelated audio resampler failure. Broad web suite
  has five failures outside focused milestone coverage, including tests receiving
  HTTP 401 when expecting 200 under this environment's authentication settings.

No production records were repaired and no deployment was made. Actual
PostgreSQL concurrency using a disposable external database has not been tested;
PostgreSQL regression verification used PGlite. Phase 2 automatic recognition
and durable prompt decisions are not implemented. Retain compatible JSON readers
on rollback, as documented in ADR 0011.

Follow-up on 2 November: the security route inventory is updated for both new
actor-scoped endpoints; all 13 route-security tests pass. The four environment-
dependent route tests pass when run with `RACEPREDICTOR_CLOUD_MODE=disabled`.
The focused web persistence/security tests pass (5 files), and web TypeScript
checking passes. The full core suite now passes 25 of 26 files; the sole failure
is the pre-existing audio resampler test. The Home geometry tolerance failure
remains unresolved and has not been compared with a clean baseline.


Follow-up on 3 November: all 26 core test files pass. The audio test harness now
counts PCM frames and ignores the processor's flush acknowledgement. A clean
HEAD worktree passed the Home geometry test; the branch's 1.203125px difference
was caused by PB achievements without a time target being labelled as incomplete.
They now retain the existing `Achieved` display; targetless ordinary finishes
remain `Completed · no linked target`. The full seven-test Home browser suite
passes, including geometry and pixel comparison.
