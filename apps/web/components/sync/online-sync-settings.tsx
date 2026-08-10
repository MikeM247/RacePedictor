"use client";

import { FormEvent, useEffect, useState } from "react";
import { DashboardNavigation } from "../dashboard/dashboard-navigation.tsx";
import "../dashboard/dashboard.css";
import "../coaching/coaching-ui.css";

type Device = {
  id: string;
  athleteId: string;
  displayName: string;
  status: "active" | "revoked";
  lastAcknowledgedCursor: string | null;
  lastSeenAt: string | null;
  createdAt: string;
  revokedAt: string | null;
};

type RequestState = "loading" | "ready" | "error";
type OperationalStatus = {
  state: "healthy" | "warning" | "hard_stop";
  processingAllowed: boolean;
  signals: Array<{ metric: string; label: string; value: number; warningAt: number; hardStopAt: number; state: "healthy" | "warning" | "hard_stop"; ownerAction: string | null }>;
  disclaimer: string;
};
type StravaConnection = {
  athleteId: string;
  provider: "strava";
  status: "disconnected" | "connecting" | "connected" | "attention" | "revoked";
  displayStatus: "connected" | "action_required" | "disconnected" | "error";
  connectedAt: string | null;
  lastSuccessfulProviderContactAt: string | null;
  lastSuccessfulSyncAt: string | null;
  lastEventReceivedAt: string | null;
  lastErrorCode: string | null;
  updatedAt: string;
};

export function OnlineSyncSettings() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [athleteId, setAthleteId] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState("Home computer");
  const [state, setState] = useState<RequestState>("loading");
  const [message, setMessage] = useState("Loading paired devices…");
  const [oneTimeToken, setOneTimeToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [operations, setOperations] = useState<OperationalStatus | null>(null);
  const [strava, setStrava] = useState<StravaConnection | null>(null);
  const [stravaBusy, setStravaBusy] = useState(false);
  const [stravaMessage, setStravaMessage] = useState("");

  useEffect(() => { void load(); }, []);

  async function load() {
    setState("loading");
    try {
      const [session, deviceList, operationalStatus, stravaStatus] = await Promise.all([
        request("/api/v1/auth/session"),
        request("/api/v1/sync/devices"),
        request("/api/v1/operations/status").catch(() => null),
        request("/api/v1/providers/strava/status").catch(() => null),
      ]);
      const activeAthleteId = asRecord(asRecord(session).actor).activeAthleteId;
      if (typeof activeAthleteId !== "string" || !activeAthleteId) throw new Error("Your athlete session is unavailable.");
      setAthleteId(activeAthleteId);
      setDevices(Array.isArray(deviceList.devices) ? deviceList.devices as Device[] : []);
      setOperations(operationalStatus as OperationalStatus | null);
      setStrava(stravaStatus ? asRecord(stravaStatus).connection as StravaConnection : null);
      if (new URLSearchParams(window.location.search).get("connection") === "connected") {
        setStravaMessage("Strava is connected. Completed workouts will be imported automatically.");
      }
      setState("ready");
      setMessage("");
    } catch (error) {
      setState("error");
      setMessage(error instanceof Error ? error.message : "Paired devices could not be loaded.");
    }
  }

  async function connectStrava() {
    if (!athleteId) return;
    setStravaBusy(true);
    setStravaMessage("Preparing a secure Strava connectionâ€¦");
    try {
      const result = await request("/api/v1/providers/strava/connect", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ athleteId, returnTo: "/dashboard/settings" }),
      });
      const authorizationUrl = String(result.authorizationUrl ?? "");
      if (!authorizationUrl) throw new Error("Strava authorization is unavailable.");
      window.location.assign(authorizationUrl);
    } catch (error) {
      setStravaBusy(false);
      setStravaMessage(error instanceof Error ? error.message : "Strava could not be connected.");
    }
  }

  async function disconnectStrava() {
    if (!window.confirm("Disconnect Strava? Automatic workout imports will stop, but accepted workouts will remain available.")) return;
    setStravaBusy(true);
    setStravaMessage("Disconnecting Stravaâ€¦");
    try {
      const result = await request("/api/v1/providers/strava/disconnect", { method: "POST" });
      setStrava(asRecord(result).connection as StravaConnection);
      setStravaMessage(result.providerRevocationConfirmed
        ? "Strava disconnected. Existing workouts and raw history were preserved."
        : "Local access was removed. Strava could not confirm remote revocation, so reconnect before importing again.");
    } catch (error) {
      setStravaMessage(error instanceof Error ? error.message : "Strava could not be disconnected.");
    } finally {
      setStravaBusy(false);
    }
  }

  async function pair(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!athleteId || !displayName.trim()) return;
    setState("loading");
    setMessage("Creating a one-time device credential…");
    setOneTimeToken(null);
    try {
      const result = await request("/api/v1/sync/devices", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ athleteId, displayName: displayName.trim(), enrollmentId: crypto.randomUUID() }),
      });
      setDevices((current) => [result.device as Device, ...current.map((item) => (
        item.status === "active" ? { ...item, status: "revoked" as const } : item
      ))]);
      setOneTimeToken(String(result.deviceToken));
      setCopied(false);
      setState("ready");
      setMessage("Device created. Save the credential locally now; it will not be shown again.");
    } catch (error) {
      setState("error");
      setMessage(error instanceof Error ? error.message : "The device could not be paired.");
    }
  }

  async function revoke(device: Device) {
    if (!window.confirm(`Revoke ${device.displayName}? Local sync will stop immediately.`)) return;
    setState("loading");
    setMessage("Revoking the local device…");
    try {
      const result = await request(`/api/v1/sync/devices/${encodeURIComponent(device.id)}`, { method: "DELETE" });
      setDevices((current) => current.map((item) => item.id === device.id ? result.device as Device : item));
      setState("ready");
      setMessage("Device revoked. Strava and your browser session are unchanged.");
    } catch (error) {
      setState("error");
      setMessage(error instanceof Error ? error.message : "The device could not be revoked.");
    }
  }

  async function copyToken() {
    if (!oneTimeToken) return;
    try {
      await navigator.clipboard.writeText(oneTimeToken);
      setCopied(true);
    } catch {
      setCopied(false);
      setMessage("Copy is unavailable. Select the credential manually and continue immediately.");
    }
  }

  return (
    <main className="dashboard-layout coaching-layout">
      <DashboardNavigation activePage="settings" />
      <div className="dashboard-main">
        <header className="dashboard-toolbar coaching-toolbar">
          <div><h2>Settings</h2><p>Secure local sync and selected Second Brain context</p></div>
          <span className="toolbar-context">Online</span>
        </header>
        <section className="coaching-content">
          <section className="coach-panel" aria-labelledby="strava-heading">
            <div className="coach-panel-heading">
              <div><p className="eyebrow">Workout source</p><h3 id="strava-heading">Automatic workouts from Strava</h3></div>
              <span className="status-chip">{strava ? stravaLabel(strava) : "Unavailable"}</span>
            </div>
            <p>Connect once and completed Strava workouts can arrive automatically. Importing a workout never changes or approves your training plan.</p>
            {strava ? <dl className="sync-provider-facts">
              <div><dt>Connected</dt><dd>{strava.connectedAt ? formatDate(strava.connectedAt) : "Not connected"}</dd></div>
              <div><dt>Last provider contact</dt><dd>{strava.lastSuccessfulProviderContactAt ? formatDate(strava.lastSuccessfulProviderContactAt) : "Never"}</dd></div>
            </dl> : <p className="quiet-copy">Strava status is temporarily unavailable. No connection action has been taken.</p>}
            <div className="coach-actions">
              {strava?.displayStatus === "connected"
                ? <button className="button button-secondary" disabled={stravaBusy} type="button" onClick={() => void disconnectStrava()}>Disconnect Strava</button>
                : <button className="button button-primary" disabled={stravaBusy || !athleteId} type="button" onClick={() => void connectStrava()}>{strava?.displayStatus === "action_required" ? "Reconnect Strava" : "Connect Strava"}</button>}
            </div>
            {stravaMessage ? <p className="coach-status" role="status">{stravaMessage}</p> : null}
          </section>

          <section className="coach-panel" aria-labelledby="local-sync-heading">
            <div className="coach-panel-heading">
              <div><p className="eyebrow">Local sync</p><h3 id="local-sync-heading">Paired computer</h3></div>
              <span className="status-chip">{devices.some((device) => device.status === "active") ? "Active" : "Not paired"}</span>
            </div>
            <p>One computer can sync workouts, approved plans, calendar sessions, and selected structured context. Pairing never exposes your Obsidian vault.</p>
            <form className="coach-form coach-form-grid sync-pair-form" onSubmit={pair}>
              <label className="field-wide"><span>Computer name</span><input maxLength={100} value={displayName} onChange={(event) => setDisplayName(event.target.value)} /></label>
              <button className="button button-primary field-wide" disabled={state === "loading" || !athleteId || !displayName.trim()} type="submit">
                {devices.some((device) => device.status === "active") ? "Replace paired computer" : "Pair this computer"}
              </button>
            </form>
            {message ? <p className={`coach-status coach-status--${state === "error" ? "error" : state === "loading" ? "loading" : "success"}`} role={state === "error" ? "alert" : "status"}>{message}</p> : null}
          </section>

          {oneTimeToken ? <section className="coach-panel sync-credential-panel" aria-labelledby="credential-heading">
            <div className="coach-panel-heading"><div><p className="eyebrow">Shown once</p><h3 id="credential-heading">Save the device credential</h3></div><span className="status-chip">One-time</span></div>
            <p>Copy this credential, then run the command below on the paired Windows computer. It is protected with your Windows account and is not stored in Obsidian or the browser.</p>
            <textarea aria-label="One-time device credential" readOnly rows={3} value={oneTimeToken} />
            <div className="coach-actions"><button className="button button-primary" type="button" onClick={() => void copyToken()}>{copied ? "Copied" : "Copy credential"}</button></div>
            <pre className="sync-command"><code>Get-Clipboard | npm run sync:local -- enroll</code></pre>
            <p className="field-help">After enrolment, use <code>npm run sync:local -- sync</code>. Re-pairing revokes the previous computer immediately.</p>
          </section> : null}

          <section className="coach-panel" aria-labelledby="device-history-heading">
            <div className="coach-panel-heading"><div><p className="eyebrow">Status</p><h3 id="device-history-heading">Device history</h3></div><button className="button button-secondary" type="button" onClick={() => void load()}>Refresh</button></div>
            {devices.length === 0 && state !== "loading" ? <p className="quiet-copy">No computer has been paired yet.</p> : <div className="sync-device-list">
              {devices.map((device) => <article className="sync-device-card" key={device.id}>
                <div><h4>{device.displayName}</h4><p>{device.status === "active" ? stateLabel(device) : "Revoked"}</p></div>
                <dl><div><dt>Paired</dt><dd>{formatDate(device.createdAt)}</dd></div><div><dt>Last sync</dt><dd>{device.lastSeenAt ? formatDate(device.lastSeenAt) : "Never"}</dd></div><div><dt>Cursor</dt><dd>{device.lastAcknowledgedCursor ?? "Not started"}</dd></div></dl>
                {device.status === "active" ? <button className="button button-secondary" type="button" onClick={() => void revoke(device)}>Revoke device</button> : null}
              </article>)}
            </div>}
          </section>

          <section className="coach-panel" aria-labelledby="privacy-boundary-heading">
            <div className="coach-panel-heading"><div><p className="eyebrow">Privacy boundary</p><h3 id="privacy-boundary-heading">Only selected structured context leaves your computer</h3></div></div>
            <p>The local publisher accepts one explicit structured JSON input. It never scans the vault. Supported sections are availability, training preferences, dated constraints, wellbeing check-ins, and activity reflections.</p>
            <p className="field-help">Notes, attachments, paths, credentials, raw provider files, code, and Codex history are rejected. Published context cannot edit a training plan.</p>
          </section>

          <section className="coach-panel" aria-labelledby="operations-heading">
            <div className="coach-panel-heading"><div><p className="eyebrow">Free-tier safety</p><h3 id="operations-heading">Operations guardrails</h3></div><span className="status-chip">{operations ? operations.state.replace("_", " ") : "Unavailable"}</span></div>
            {!operations ? <p className="quiet-copy">Usage status is temporarily unavailable. Automatic processing remains fail-closed when its recovery configuration is unavailable.</p> : <>
              <p>{operations.processingAllowed ? "Automatic recovery is within the configured planning ceilings." : "New automatic processing is paused. Already accepted workouts and raw records are preserved."}</p>
              <div className="sync-device-list">{operations.signals.filter((signal) => signal.state !== "healthy").map((signal) => <article className="sync-device-card" key={signal.metric}><div><h4>{signal.label}</h4><p>{signal.state.replace("_", " ")}</p></div><dl><div><dt>Measured</dt><dd>{signal.value.toLocaleString()}</dd></div><div><dt>Warning</dt><dd>{signal.warningAt.toLocaleString()}</dd></div><div><dt>Hard stop</dt><dd>{signal.hardStopAt.toLocaleString()}</dd></div></dl><p>{signal.ownerAction}</p></article>)}</div>
              <p className="field-help">{operations.disclaimer}</p>
            </>}
          </section>
        </section>
      </div>
    </main>
  );
}

async function request(url: string, init?: RequestInit) {
  const response = await fetch(url, init);
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(String(asRecord(asRecord(body).error).message ?? "The request could not be completed."));
  return asRecord(asRecord(body).data);
}

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" ? value as Record<string, unknown> : {};
}

function formatDate(value: string) {
  return new Date(value).toLocaleString();
}

function stateLabel(device: Device) {
  if (!device.lastSeenAt) return "Active · waiting for first sync";
  return Date.now() - Date.parse(device.lastSeenAt) > 24 * 60 * 60 * 1_000 ? "Stale · computer has not synced recently" : "Active";
}

function stravaLabel(connection: StravaConnection) {
  if (connection.displayStatus === "connected") return "Connected";
  if (connection.displayStatus === "action_required") return "Action required";
  if (connection.displayStatus === "error") return "Unavailable";
  return "Disconnected";
}
