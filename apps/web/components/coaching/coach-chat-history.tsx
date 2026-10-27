"use client";

import { useEffect, useRef, useState } from "react";
import { coachHistoryListSchema, coachHistoryMessagesSchema, type CoachArchiveSummary, type CoachConversationMessage } from "../../../../packages/core/src/contracts/coach-chat";
import { NativeModal } from "./native-modal";

async function read(url: string) {
  const response = await fetch(url, { cache: "no-store" });
  const body = await response.json();
  if (!response.ok) throw new Error("Saved chats could not be loaded. Please retry.");
  return body.data;
}

export function CoachChatHistory({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [items, setItems] = useState<CoachArchiveSummary[]>([]);
  const [nextBefore, setNextBefore] = useState<number | null>(null);
  const [selected, setSelected] = useState<CoachArchiveSummary | null>(null);
  const [messages, setMessages] = useState<CoachConversationMessage[]>([]);
  const [olderBefore, setOlderBefore] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState<(() => void) | null>(null);
  const epoch = useRef(0);

  async function loadList(before?: number) {
    const request = ++epoch.current;
    setBusy(true); setError(""); setRetry(null);
    try {
      const data = coachHistoryListSchema.parse(await read(`/api/v1/coaching/chat/history${before ? `?before=${before}` : ""}`));
      if (request !== epoch.current) return;
      setItems((current) => before ? [...current, ...data.items] : data.items);
      setNextBefore(data.nextBefore);
    } catch {
      if (request === epoch.current) { setError("Saved chats could not be loaded."); setRetry(() => () => void loadList(before)); }
    } finally { if (request === epoch.current) setBusy(false); }
  }

  async function loadMessages(archive: CoachArchiveSummary, before?: number) {
    const request = ++epoch.current;
    setSelected(archive); setBusy(true); setError(""); setRetry(null);
    if (!before) { setMessages([]); setOlderBefore(null); }
    try {
      const data = coachHistoryMessagesSchema.parse(await read(`/api/v1/coaching/chat/history/${encodeURIComponent(archive.id)}${before ? `?before=${before}` : ""}`));
      if (request !== epoch.current) return;
      setMessages((current) => before ? [...data.messages, ...current] : data.messages);
      setOlderBefore(data.hasOlder ? data.oldestSequence : null);
    } catch {
      if (request === epoch.current) { setError("This saved chat could not be loaded."); setRetry(() => () => void loadMessages(archive, before)); }
    } finally { if (request === epoch.current) setBusy(false); }
  }

  useEffect(() => {
    if (open) { setSelected(null); setMessages([]); setItems([]); void loadList(); }
    return () => { epoch.current += 1; };
  }, [open]);

  return <NativeModal open={open} titleId="coach-history-title" onClose={onClose} className="coach-history-dialog">
    <header className="coach-history-heading"><h2 id="coach-history-title">Previous chats</h2><button type="button" onClick={onClose} aria-label="Close previous chats">×</button></header>
    {selected ? <>
      <button type="button" onClick={() => { epoch.current += 1; setBusy(false); setError(""); setRetry(null); setSelected(null); }}>Back to saved chats</button>
      <h3>{selected.title}</h3><p>Saved {new Date(selected.archivedAt).toLocaleString()} · Read only</p>
      {olderBefore ? <button type="button" disabled={busy} onClick={() => void loadMessages(selected, olderBefore)}>Load earlier messages</button> : null}
      <ol className="coach-history-messages" aria-label="Saved conversation messages">{messages.map((message) => <li key={message.id}><strong>{message.role === "user" ? "You" : "ORBIT"}</strong><p>{message.text}</p><time dateTime={message.createdAt}>{new Date(message.createdAt).toLocaleString()}</time></li>)}</ol>
    </> : <>
      <p>Saved discussions are available here for reading.</p>
      <ul className="coach-history-list">{items.map((archive) => <li key={archive.id}><button type="button" disabled={busy} onClick={() => void loadMessages(archive)}><strong>{archive.title}</strong><time dateTime={archive.archivedAt}>{new Date(archive.archivedAt).toLocaleString()}</time></button></li>)}</ul>
      {!busy && !error && !items.length ? <p>No previous chats yet.</p> : null}
      {nextBefore ? <button type="button" disabled={busy} onClick={() => void loadList(nextBefore)}>Load more chats</button> : null}
    </>}
    {busy ? <p role="status">Loading saved chats…</p> : null}
    {error ? <div role="alert"><p>{error}</p><button type="button" onClick={() => retry?.()}>Retry</button></div> : null}
  </NativeModal>;
}
