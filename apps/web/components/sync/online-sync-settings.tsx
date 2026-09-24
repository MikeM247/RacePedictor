"use client";

import { FormEvent, useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { DashboardNavigation } from "../dashboard/dashboard-navigation.tsx";
import "../dashboard/dashboard.css";
import "../coaching/coaching-ui.css";
import { safeRecoveryPath } from "../../lib/recovery-context";

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

type SettingsGroupName = "connections" | "devices" | "privacy" | "operations";

function SettingsGroup({
  name,
  title,
  open,
  onToggle,
  children,
}: {
  name: SettingsGroupName;
  title: string;
  open: boolean;
  onToggle: (name: SettingsGroupName) => void;
  children: ReactNode;
}) {
  return <details className="settings-group" open={open} onToggle={(event) => { if (event.currentTarget.open) onToggle(name); }}>
    <summary>{title}</summary>
    <div className="settings-group-content">{children}</div>
  </details>;
}

export function OnlineSyncSettings() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [athleteId, setAthleteId] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState("Home computer");
  const [deviceState, setDeviceState] = useState<RequestState>("loading");
  const [deviceMessage, setDeviceMessage] = useState("Loading paired computers…");
  const [oneTimeToken, setOneTimeToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [operations, setOperations] = useState<OperationalStatus | null>(null);
  const [strava, setStrava] = useState<StravaConnection | null>(null);
  const [stravaBusy, setStravaBusy] = useState(false);
  const [stravaMessage, setStravaMessage] = useState("");
  const [stravaReadFailed, setStravaReadFailed] = useState(false);
  const [operationsReadFailed, setOperationsReadFailed] = useState(false);
  const [deviceMutationBusy, setDeviceMutationBusy] = useState(false);
  const deviceGeneration = useRef(0);
  const providerGeneration = useRef(0);
  const operationsGeneration = useRef(0);
  const [returnTo, setReturnTo] = useState("/dashboard/settings");
  const [settingsGroup, setSettingsGroup] = useState<SettingsGroupName>("connections");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const requestedReturn = params.get("returnTo");
    setReturnTo(safeRecoveryPath(requestedReturn, "/dashboard/settings"));
    const requestedSection = params.get("section");
    if (requestedSection === "connections" || requestedSection === "devices" || requestedSection === "privacy" || requestedSection === "operations") setSettingsGroup(requestedSection);
    void loadSessionAndDevices();
    void loadStrava();
    void loadOperations();
  }, []);

  async function loadSessionAndDevices() {
    const generation = ++deviceGeneration.current;
    setDeviceState("loading");
    try {
      const [session, deviceList] = await Promise.all([request("/api/v1/auth/session"), request("/api/v1/sync/devices")]);
      const activeAthleteId = asRecord(asRecord(session).actor).activeAthleteId;
      if (typeof activeAthleteId !== "string" || !activeAthleteId) throw new Error("Your athlete session is unavailable.");
      if (generation !== deviceGeneration.current) return;
      setAthleteId(activeAthleteId);
      setDevices(Array.isArray(deviceList.devices) ? deviceList.devices as Device[] : []);
      setDeviceState("ready"); setDeviceMessage("");
    } catch (error) {
      if (generation === deviceGeneration.current) { setDeviceState("error"); setDeviceMessage(error instanceof Error ? error.message : "Paired computers could not be loaded."); }
    }
  }

  async function loadStrava() {
    const generation = ++providerGeneration.current;
    setStravaReadFailed(false);
    try {
      const stravaStatus = await request("/api/v1/providers/strava/status");
      if (generation !== providerGeneration.current) return;
      const connection = asRecord(stravaStatus).connection;
      if (!connection || typeof connection !== "object") throw new Error("Strava status was unsupported.");
      setStrava(connection as StravaConnection);
      const query = new URLSearchParams(window.location.search);
      if (query.get("connection") === "connected") {
        const backfill = query.get("backfill");
        setStravaMessage(
          backfill === "queued"
            ? "Strava is connected and the initial 90-day import is queued. Refresh Training shortly to see imported workouts."
            : backfill === "already_queued"
              ? "Strava is connected and the initial 90-day import is already queued. Refresh Training shortly to see imported workouts."
              : "Strava is connected, but the initial import could not be queued. Use Import last 90 days below to retry.",
        );
      }
    } catch {
      if (generation === providerGeneration.current) { setStravaReadFailed(true); setStravaMessage("Strava status could not be checked. This is not a disconnected account."); }
    }
  }

  async function loadOperations() {
    const generation = ++operationsGeneration.current;
    setOperationsReadFailed(false);
    try {
      const value = await request("/api/v1/operations/status");
      if (generation !== operationsGeneration.current) return;
      if (!Array.isArray(value.signals) || typeof value.processingAllowed !== "boolean") throw new Error("Operations status was unsupported.");
      setOperations(value as OperationalStatus);
    } catch {
      if (generation === operationsGeneration.current) { setOperationsReadFailed(true); setOperations(null); }
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
        body: JSON.stringify({ athleteId, returnTo }),
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

  async function importRecentStravaHistory() {
    if (strava?.displayStatus !== "connected") return;
    const before = new Date();
    const after = new Date(before.getTime() - 90 * 24 * 60 * 60 * 1_000);
    setStravaBusy(true);
    setStravaMessage("Queueing the last 90 days of Strava workouts…");
    try {
      const result = await request("/api/v1/providers/strava/backfill", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          after: after.toISOString(),
          before: before.toISOString(),
          pageSize: 30,
          maxPages: 5,
          maxActivities: 150,
        }),
      });
      setStravaMessage(result.reused === true
        ? "Recent Strava history is already queued. It may take a moment to appear in Activities."
        : "Recent Strava history is queued. It may take a moment to appear in Activities.");
    } catch (error) {
      setStravaMessage(error instanceof Error ? error.message : "Recent Strava history could not be queued.");
    } finally {
      setStravaBusy(false);
    }
  }

  async function pair(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!athleteId || !displayName.trim() || deviceMutationBusy || deviceState !== "ready") return;
    setDeviceMutationBusy(true); setDeviceState("loading");
    setDeviceMessage("Creating a one-time device credential…");
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
      setDeviceState("ready"); setDeviceMessage("Device created. Save the credential locally now; it will not be shown again.");
    } catch (error) {
      setDeviceState("error"); setDeviceMessage(error instanceof Error ? error.message : "The device could not be paired. The name is still available to retry.");
    } finally { setDeviceMutationBusy(false); }
  }

  async function revoke(device: Device) {
    if (!window.confirm(`Revoke ${device.displayName}? Local sync will stop immediately.`)) return;
    if (deviceMutationBusy) return;
    setDeviceMutationBusy(true); setDeviceState("loading"); setDeviceMessage("Revoking the local device…");
    try {
      const result = await request(`/api/v1/sync/devices/${encodeURIComponent(device.id)}`, { method: "DELETE" });
      setDevices((current) => current.map((item) => item.id === device.id ? result.device as Device : item));
      setDeviceState("ready"); setDeviceMessage("Device revoked. Strava and your browser session are unchanged.");
    } catch (error) {
      setDeviceState("error"); setDeviceMessage(error instanceof Error ? error.message : "The device could not be revoked. Check paired-computer status before retrying.");
    } finally { setDeviceMutationBusy(false); }
  }

  async function copyToken() {
    if (!oneTimeToken) return;
    try {
      await navigator.clipboard.writeText(oneTimeToken);
      setCopied(true);
    } catch {
      setCopied(false);
      setDeviceMessage("Copy is unavailable. Select the credential manually and continue immediately.");
    }
  }

  return (
    <div className="dashboard-layout coaching-layout coaching-layout--settings">
      <DashboardNavigation activePage="settings" />
      <main id="dashboard-main-content" className="dashboard-main" tabIndex={-1} aria-labelledby="settings-page-title">
        <header className="dashboard-toolbar coaching-toolbar">
          <div><p className="eyebrow">Training workspace</p><h1 id="settings-page-title">Settings</h1><p>Secure local sync and selected Second Brain context</p></div>
          <span className="toolbar-context">Online</span>
        </header>
        {returnTo !== "/dashboard/settings" ? <div className="coach-actions"><Link className="button button-secondary" href={returnTo}>Return to import recovery</Link></div> : null}
        <section className="coaching-content coaching-content--settings">
          <SettingsGroup name="connections" title="Connections" open={settingsGroup === "connections"} onToggle={setSettingsGroup}>
          <section className="coach-panel settings-panel settings-panel--connections" aria-labelledby="strava-heading">
            <div className="coach-panel-heading">
              <div><p className="eyebrow">Workout source</p><h2 id="strava-heading">Automatic workouts from Strava</h2></div>
              <span className="status-chip">{strava ? stravaLabel(strava) : "Unavailable"}</span>
            </div>
            <p>Connect once and completed Strava workouts can arrive automatically. Importing a workout never changes or approves your training plan.</p>
            <p className="field-help">You can also import the last 90 days, capped at 150 activities, if a workout was completed before you connected.</p>
            {strava ? <dl className="sync-provider-facts">
              <div><dt>Connected</dt><dd>{strava.connectedAt ? formatDate(strava.connectedAt) : "Not connected"}</dd></div>
              <div><dt>Last provider contact</dt><dd>{strava.lastSuccessfulProviderContactAt ? formatDate(strava.lastSuccessfulProviderContactAt) : "Never"}</dd></div>
            </dl> : <p className="quiet-copy">Strava status is temporarily unavailable. A failed status read is not a disconnected account, and no connection action has been taken.</p>}
            {stravaReadFailed ? <button className="button button-secondary" type="button" onClick={() => void loadStrava()}>Retry Strava status</button> : null}
            <div className="coach-actions">
              {strava?.displayStatus === "connected"
                ? <>
                    <button className="button button-secondary" disabled={stravaBusy} type="button" onClick={() => void importRecentStravaHistory()}>Import last 90 days</button>
                    <button className="button button-secondary" disabled={stravaBusy} type="button" onClick={() => void disconnectStrava()}>Disconnect Strava</button>
                  </>
                : <button className="button button-primary" disabled={stravaBusy || !athleteId} type="button" onClick={() => void connectStrava()}>{strava?.displayStatus === "action_required" ? "Reconnect Strava" : "Connect Strava"}</button>}
            </div>
            {stravaMessage ? <p className="coach-status" role="status">{stravaMessage}</p> : null}
          </section>

          </SettingsGroup>

          <SettingsGroup name="devices" title="Paired computer" open={settingsGroup === "devices"} onToggle={setSettingsGroup}>
          <section className="coach-panel settings-panel settings-panel--devices" aria-labelledby="device-history-heading">
            <div className="coach-panel-heading"><div><p className="eyebrow">Local sync</p><h2 id="device-history-heading">Pair and manage a computer</h2></div><span className="status-chip">{deviceState === "error" ? "Unknown" : devices.some((device) => device.status === "active") ? "Active" : "Not paired"}</span></div>
            <p>One computer can sync workouts, approved plans, calendar sessions, and selected structured context. Pairing never exposes your Obsidian vault.</p>
            {deviceState === "error" ? <><p className="quiet-copy">Paired-computer status could not be checked. This is not the same as having no paired computer.</p><button className="button button-secondary" type="button" onClick={() => void loadSessionAndDevices()}>Retry paired-computer status</button></> : <form className="coach-form coach-form-grid sync-pair-form" onSubmit={pair}><label className="field-wide"><span>Computer name</span><input maxLength={100} value={displayName} onChange={(event) => setDisplayName(event.target.value)} /></label><button className="button button-primary field-wide" disabled={deviceMutationBusy || deviceState !== "ready" || !athleteId || !displayName.trim()} type="submit">{devices.some((device) => device.status === "active") ? "Replace paired computer" : "Pair this computer"}</button></form>}
            {deviceMessage ? <p className={`coach-status coach-status--${deviceState === "error" ? "error" : deviceState === "loading" ? "loading" : "success"}`} role={deviceState === "error" ? "alert" : "status"}>{deviceMessage}</p> : null}
            {oneTimeToken ? <section className="sync-credential-panel" aria-labelledby="credential-heading"><div className="coach-panel-heading"><div><p className="eyebrow">Shown once</p><h3 id="credential-heading">Save the device credential</h3></div><span className="status-chip">One-time</span></div><p>Copy this credential, then run the command below on the paired Windows computer. It is not stored in the browser.</p><textarea aria-label="One-time device credential" readOnly rows={3} value={oneTimeToken} /><div className="coach-actions"><button className="button button-primary" type="button" onClick={() => void copyToken()}>{copied ? "Copied" : "Copy credential"}</button></div><pre className="sync-command"><code>Get-Clipboard | npm run sync:local -- enroll</code></pre></section> : null}
            <h3>Device history</h3>
            {devices.length === 0 && deviceState === "ready" ? <p className="quiet-copy">No computer has been paired yet.</p> : <div className="sync-device-list">
              {devices.map((device) => <article className="sync-device-card" key={device.id}>
                <div><h4>{device.displayName}</h4><p>{device.status === "active" ? stateLabel(device) : "Revoked"}</p></div>
                <dl><div><dt>Paired</dt><dd>{formatDate(device.createdAt)}</dd></div><div><dt>Last sync</dt><dd>{device.lastSeenAt ? formatDate(device.lastSeenAt) : "Never"}</dd></div><div><dt>Cursor</dt><dd>{device.lastAcknowledgedCursor ?? "Not started"}</dd></div></dl>
                {device.status === "active" ? <button className="button button-secondary" disabled={deviceMutationBusy} type="button" onClick={() => void revoke(device)}>Revoke device</button> : null}
              </article>)}
            </div>}
          </section>
          </SettingsGroup>

          <SettingsGroup name="privacy" title="Privacy" open={settingsGroup === "privacy"} onToggle={setSettingsGroup}>
          <section className="coach-panel settings-panel settings-panel--privacy" aria-labelledby="privacy-boundary-heading">
            <div className="coach-panel-heading"><div><p className="eyebrow">Privacy boundary</p><h2 id="privacy-boundary-heading">Only selected structured context leaves your computer</h2></div></div>
            <p>The local publisher accepts one explicit structured JSON input. It never scans the vault. Supported sections are availability, training preferences, dated constraints, wellbeing check-ins, and activity reflections.</p>
            <p className="field-help">Notes, attachments, paths, credentials, raw provider files, code, and Codex history are rejected. Published context cannot edit a training plan.</p>
          </section>
          </SettingsGroup>

          <SettingsGroup name="operations" title="Operations" open={settingsGroup === "operations"} onToggle={setSettingsGroup}>
          <section className="coach-panel settings-panel settings-panel--operations" aria-labelledby="operations-heading">
            <div className="coach-panel-heading"><div><p className="eyebrow">Free-tier safety</p><h2 id="operations-heading">Operations guardrails</h2></div><span className="status-chip">{operations ? operations.state.replace("_", " ") : "Unavailable"}</span></div>
            {!operations ? <><p className="quiet-copy">Usage status is temporarily unavailable. Automatic processing remains fail-closed when its recovery configuration is unavailable.</p>{operationsReadFailed ? <button className="button button-secondary" type="button" onClick={() => void loadOperations()}>Retry operations status</button> : null}</> : <>
              <p>{operations.processingAllowed ? "Automatic recovery is within the configured planning ceilings." : "New automatic processing is paused. Already accepted workouts and raw records are preserved."}</p>
              <div className="sync-device-list">{operations.signals.filter((signal) => signal.state !== "healthy").map((signal) => <article className="sync-device-card" key={signal.metric}><div><h3>{signal.label}</h3><p>{signal.state.replace("_", " ")}</p></div><dl><div><dt>Measured</dt><dd>{signal.value.toLocaleString()}</dd></div><div><dt>Warning</dt><dd>{signal.warningAt.toLocaleString()}</dd></div><div><dt>Hard stop</dt><dd>{signal.hardStopAt.toLocaleString()}</dd></div></dl><p>{signal.ownerAction}</p></article>)}</div>
              <p className="field-help">{operations.disclaimer}</p>
            </>}
          </section>
          </SettingsGroup>
        </section>
      </main>
    </div>
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
