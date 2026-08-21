# Local Garmin → Obsidian workflow

This workflow turns a Garmin Connect `Activities.csv` export into an immutable raw archive, a validated local database, weekly analytics, a dashboard snapshot, and selected Obsidian notes.

## Run the complete refresh

From the repository root:

```powershell
npm run db:refresh:local -- --source "<path-to-garmin-export>\Activities.csv"
```

The default private outputs are ignored by Git:

- Raw archive: `.local/obsidian-vault/Raw/Garmin/<year>/<month>/`
- Normalized database: `.local/racepredictor/racepredictor.sqlite`
- App snapshot: `.local/racepredictor/dashboard-overview.json`
- Obsidian reviews and context: `.local/obsidian-vault/`

To publish directly into an existing Obsidian vault:

```powershell
npm run db:refresh:local -- --source "<path-to-garmin-export>\Activities.csv" --vault "<path-to-obsidian-vault>"
```

Useful options:

- `--athlete <id>`: athlete partition; defaults to `athlete_001`.
- `--utc-offset <+HH:mm>`: Garmin timestamp offset; defaults to `+02:00` for Africa/Johannesburg.
- `--state-dir <path>`: private SQLite and dashboard snapshot directory.
- `--target-km <number>`: prediction distance; defaults to half marathon (`21.0975`).
- `--review-weeks <1-52>`: recent weekly Obsidian notes to maintain; defaults to `12`.

## Processing and safety rules

1. The source file is copied into `Raw/Garmin` under a checksum-addressed name.
2. The raw CSV and its manifest are made read-only. Every rerun verifies the SHA-256 checksum before reuse.
3. CSV rows enter `staging_activities`, where required fields, units, activity type, date format, and durations are validated.
4. With no Garmin activity ID in this export, deduplication uses a SHA-256 signature of athlete, sport, minute-bucketed start time, elapsed time, distance, and elevation gain.
5. Valid rows enter canonical `activities`; invalid and duplicate staging rows retain an explicit status.
6. Monday–Sunday `weekly_features` are rebuilt from normalized activities and reconciled to the canonical distance total.
7. Riegel 1.06 projections are computed for 5 km, 10 km, half marathon, and marathon from the best eligible 5–30 km activity in the latest 180 days of the imported history. They are training estimates with uncertainty bands, not calibrated coaching guarantees.
8. The app reads the generated dashboard snapshot by default and lets you switch between the four race distances without reloading. Set `RACEPREDICTOR_DATA_SOURCE=mock` to use fixtures.
9. Obsidian reviews update only between `racepredictor:generated` markers. Personal context outside those markers and the context/template notes are never overwritten.

## What to write in Obsidian

Use `Areas/Health & Fitness/Running/Running Context.md` for longer-lived goals, constraints, injury context, preferences, and shoes. Add weekly lived experience—energy, sleep, pain, heat, stress, and session reflections—to the Personal context section of each generated review. Use `Templates/Running Activity Context.md` when a particular run needs a richer note.

Do not manually edit files under `Raw/Garmin`. If Garmin issues a corrected export, run the refresh with the new file; its checksum creates a separate raw record and the canonical activity signature prevents duplicates.
