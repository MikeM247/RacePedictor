"use client";

import { useState } from "react";
import { coachConversationStateSchema } from "../../../../packages/core/src/contracts/coach-chat";
import { NativeModal } from "./native-modal";

export function CoachHistorySettings() {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState(false);

  async function clearHistory() {
    setBusy(true); setError(false); setMessage("");
    try {
      const sessionResponse = await fetch("/api/v1/auth/session", { cache: "no-store" });
      const session = await sessionResponse.json();
      const athleteId = session.data?.actor?.activeAthleteId;
      if (!sessionResponse.ok || !session.data?.authenticated || typeof athleteId !== "string") throw new Error("Sign in before permanently deleting your coaching history.");
      const currentResponse = await fetch("/api/v1/coaching/chat/conversation", { cache: "no-store" });
      const currentBody = await currentResponse.json().catch(() => ({}));
      if (!currentResponse.ok) throw new Error("Coaching history could not be checked. Retry before clearing it.");
      const current = coachConversationStateSchema.safeParse(currentBody && typeof currentBody === "object" ? (currentBody as Record<string, unknown>).data : undefined);
      if (!current.success) throw new Error("Coaching history could not be read safely. Retry before clearing it.");
      const response = await fetch("/api/v1/coaching/chat/conversation", {
        method: "DELETE", headers: { "content-type": "application/json" },
        body: JSON.stringify({ expectedGeneration: current.data.generation, expectedSequence: current.data.sequence }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        const failure = result && typeof result === "object" ? (result as Record<string, unknown>).error : null;
        throw new Error(failure && typeof failure === "object" && typeof (failure as Record<string, unknown>).message === "string"
          ? String((failure as Record<string, unknown>).message)
          : "Coaching history could not be cleared. Reload and try again.");
      }
      try {
        for (let index = sessionStorage.length - 1; index >= 0; index -= 1) {
          const key = sessionStorage.key(index);
          if (key?.startsWith(`racepredictor.coach.v2.${athleteId}.`)) sessionStorage.removeItem(key);
        }
      } catch { /* session storage is optional */ }
      try {
        const channel = new BroadcastChannel("racepredictor.coach-history");
        channel.postMessage({ type: "cleared", athleteId, generation: result.data?.generation }); channel.close();
      } catch { /* BroadcastChannel is optional */ }
      setOpen(false); setMessage("Coaching history cleared. Your plan, activities, and wellbeing records are unchanged.");
    } catch (caught) {
      setError(true); setMessage(caught instanceof Error ? caught.message : "Coaching history could not be cleared.");
    } finally { setBusy(false); }
  }

  return <section className="coach-panel settings-panel" aria-labelledby="coach-history-heading">
    <div className="coach-panel-heading"><div><p className="eyebrow">Conversation privacy</p><h2 id="coach-history-heading">Coaching history</h2></div></div>
    <p>Clear chat in Coach saves a discussion to Previous chats. Permanent deletion here removes the current discussion, all previous chats, saved context, and reflection markers. It does not change your training plan, activities, or saved wellbeing records.</p>
    <div className="coach-actions"><button className="button button-secondary" type="button" onClick={() => setOpen(true)}>Permanently delete all coaching history</button></div>
    {message ? <p className={`coach-status${error ? " coach-status--error" : " coach-status--success"}`} role={error ? "alert" : "status"}>{message}</p> : null}
    <NativeModal open={open} titleId="clear-coach-history-heading" onClose={() => setOpen(false)} busy={busy} className="coach-history-clear-dialog">
      <header className="road-dialog-heading"><div><p className="eyebrow">Conversation privacy</p><h2 id="clear-coach-history-heading">Permanently delete all coaching history?</h2></div><button className="road-close" type="button" aria-label="Close confirmation" onClick={() => setOpen(false)} disabled={busy}>×</button></header>
      <p>This permanently removes your current Coach discussion, all previous chats, saved conversation context, and reflection markers. Deleted chats cannot be recovered. Your plan, activities, and wellbeing check-ins remain saved.</p>
      {error ? <p role="alert">{message}</p> : null}
      <div className="journal-form-actions"><button className="button button-primary" type="button" disabled={busy} onClick={() => void clearHistory()}>{busy ? "Deleting…" : "Delete all history"}</button><button className="button button-secondary" type="button" disabled={busy} onClick={() => setOpen(false)}>Cancel</button></div>
    </NativeModal>
  </section>;
}
