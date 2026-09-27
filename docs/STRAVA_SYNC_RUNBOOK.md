# Strava workout sync: owner and operator runbook

This guide covers the online Race Predictor Training workspace. Imported workouts appear in **Training**; they do not approve or change a training plan. A connected badge or a completed queue job alone does not prove that a particular workout was saved.

## Normal flow and freshness check

1. Strava sends activity events to the application. The application saves each event as durable work, fetches the activity from Strava, validates and saves it, then updates Training.
2. A daily scheduled reconciliation at **03:00 UTC** checks a bounded 48-hour Strava window for each connected athlete. It also processes available work. The schedule is recovery support; it is not a guarantee that a workout will appear at a fixed time.
3. In **Training**, check that the latest workout's **date, title, and distance** match Strava. In **Settings → Connections**, check that Strava says **Connected** and inspect **Recent Strava imports** if history was requested. **Last provider contact** means the application reached Strava; it does not prove that every activity was accepted.
4. For a newly connected account, the OAuth callback queues an initial 90-day import. A manual **Import last 90 days** is also available while connected, limited to five pages and 150 activities. Verify the import's status and then verify the specific workouts in Training.

## Owner recovery when workouts are missing

1. Note the newest workout shown in Training and the newest workout shown in Strava. Record their dates, without sharing account credentials or raw activity data.
2. Open **Settings → Connections**. If the status is **Action required**, use **Reconnect Strava** and complete authorization in Strava. If it says **Connected**, keep that connection and continue.
3. Select **Import last 90 days** once if a recent import is not already queued. Use **Refresh status** to follow the newest request. Repeated requests do not repair a failed payload and can consume Strava's read budget.
4. If the newest request says **Needs attention**, record its **diagnostic code** and request time. A code beginning `STRAVA_PAYLOAD_INVALID_` identifies the response stage and field that could not be validated. Share the code, not your password, authorization URL, token, or raw provider response.
5. If the request finishes, return to **Training** and check the previously missing workouts individually. A finished job only confirms that processing ended. If an activity remains missing, report its date and the job status for further investigation.

Disconnecting and reconnecting is appropriate when the connection says **Action required** or Strava access has been revoked. A validation failure such as `STRAVA_PAYLOAD_INVALID` requires a code fix and a new import after deployment; reconnecting alone will reproduce it.

## Operator investigation and repair

1. Confirm the owner-visible evidence: connection state, last provider contact, newest import request and diagnostic code, and latest accepted Training activity. Avoid treating HTTP `202` for a backfill request as an import success.
2. Inspect production request logs for the callback, backfill, webhook, and internal reconciliation paths. A webhook `503` is a receipt failure to investigate; it does not identify which activity, if any, was accepted. Inspect the durable ingestion job state where authorized. Preserve provider tokens and raw activity data in their protected stores.
3. For `STRAVA_PAYLOAD_INVALID_<STAGE>_<FIELD>_<ISSUE>`, compare the named stage and field with the [Strava API reference](https://developers.strava.com/docs/reference/) and the allowlisted projection in `packages/core/src/contracts/strava.ts`. Reproduce with a synthetic fixture matching the supported Strava response shape. Change only the required mapping or validation rule; retain athlete scoping and field limits.
4. Run the relevant core, database, and web tests, web typecheck, and production build. Deploy through a ready preview, then production. Confirm the live deployment is ready before requesting another bounded import.
5. Queue one fresh 90-day import. Its newly generated diagnostic code reflects the current code; older failed jobs keep their original code. Wait for processing or a deferred rate window. Verify the specific missing workouts in Training, including date and distance, and check for duplicates. Only then mark the incident resolved.
6. Check later webhook receipts and the next scheduled reconciliation. If new workouts again stop arriving, inspect receipt failures, durable job attempts, connection state, rate pacing, and operations guardrails. Do not delete jobs or raw objects to force a retry.

## Reconnect race fixed on 2026-09-27

A delayed Strava `deauthorization` webhook could arrive after a successful reconnect and previously cleared the new credentials. The connection repository now applies a deauthorization only when its event time is at or after the current connection time. This protects a new connection; a connection already revoked before deployment still requires owner authorization.

## Incident record checklist

Record the latest Strava workout date, latest Training workout date, connection state, newest import request time and status, diagnostic code, production release, code change, verification result, and whether subsequent automatic delivery worked. Do not include credentials, authorization query parameters, raw provider payloads, or private activity details in a shared incident record.
