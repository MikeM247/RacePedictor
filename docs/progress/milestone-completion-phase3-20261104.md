# Milestone completion Phase 3 — 4 November 2026

Completed the Phase 3 usability and release preparation work in the milestone
completion plan.

The Home review now compares the candidate's saved facts with the target,
shows the assessment and any signed time difference, separates confirmed PB
claims from target success, and uses supportive copy that does not claim a
finish or target outcome before confirmation. When multiple saved results
match one target, the athlete chooses the result; Later or Not this race can
apply to the unchanged ambiguous group. A confirmed target is excluded from
future prompts, including where legacy inference already displays its result.

Review checks run after Home loads and on focus, visibility, local result or
milestone changes, recognized activity-sync events, focus leaving an active
control, and a 30-second refresh. They wait while another dialog or an active
control is in use. Closing the prompt returns focus to the Home heading.
Responsive dialog layout and narrow-screen accessibility are covered in the
browser suite. Settings lists unresolved candidate results and opens the
existing confirmation flow with the suggested saved result selected. Settings
and Home use the same status formatter.

Automatic recognition has an independent
`RACEPREDICTOR_MILESTONE_RECOGNITION_ENABLED=false` switch. It suppresses
candidate prompts without changing milestone management, confirmed links, or
stored review decisions. The switch defaults on when milestone Home is enabled.

Verification on synthetic data:

- Core tests: 26/26 pass, including ambiguous-group deferral, source-change
  reappearance and prompt suppression after target linking.
- Web tests: 53/53 pass with `RACEPREDICTOR_CLOUD_MODE=disabled`.
- Web TypeScript check passes.
- Local milestone browser/API suite: 23/23 pass, including candidate choice,
  Settings discovery, sync while Home is open, focus restoration, mobile
  dialog layout, accessibility, image handling, and refreshed state.
- Online fixture handoff browser check: 1/1 passes.
- Optimized web production build passes.
- `git diff --check` passes.

The PGlite PostgreSQL migration, ownership, persistence and revision checks
pass in the web tests. The online fixture check covers the paired-device plan
handoff; a full owner-authenticated milestone write/read browser journey
against managed PostgreSQL was not run. No production database was accessed,
and no deployment or live-record changes were made. Treat managed-cloud
milestone transaction and concurrency verification as a release follow-up.
