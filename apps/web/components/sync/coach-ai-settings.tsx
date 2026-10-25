"use client";

import { useEffect, useMemo, useState } from "react";

type Provider = "openai" | "openrouter";
type Model = { id: string; name: string; description?: string; contextLength?: number };
type Settings = { provider: Provider; modelId: string; revision: number; credentials: Record<Provider, boolean> };

async function api(url: string, init?: RequestInit) {
  const response = await fetch(url, init);
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(String(body?.error?.message ?? "The request could not be completed."));
  return body.data;
}

export function CoachAiSettings() {
  const [saved, setSaved] = useState<Settings | null>(null);
  const [provider, setProvider] = useState<Provider | null>(null);
  const [modelId, setModelId] = useState("");
  const [models, setModels] = useState<Model[]>([]);
  const [catalogStale, setCatalogStale] = useState(false);
  const [readState, setReadState] = useState<"loading" | "ready" | "error">("loading");
  const [catalogState, setCatalogState] = useState<"loading" | "ready" | "error">("loading");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [conflict, setConflict] = useState(false);
  const dirty = Boolean(saved && provider && (provider !== saved.provider || modelId !== saved.modelId));
  const [query, setQuery] = useState("");
  const filteredModels = useMemo(() => models.filter((item) => `${item.name} ${item.id}`.toLowerCase().includes(query.toLowerCase())), [models, query]);

  async function loadSettings() {
    setConflict(false); setReadState("loading"); setMessage("");
    try {
      const value = await api("/api/v1/coaching/ai-settings") as Settings;
      setSaved(value); setProvider(value.provider); setModelId(value.modelId); setReadState("ready");
      await loadModels(value.provider, value.modelId);
    } catch (error) { setReadState("error"); setMessage(error instanceof Error ? error.message : "Saved coach settings could not be read."); }
  }
  async function loadModels(target: Provider, selected = "") {
    setMessage(""); setCatalogState("loading");
    try {
      const value = await api(`/api/v1/coaching/ai-models?provider=${target}`) as { models: Model[]; stale: boolean };
      setModels(value.models); setCatalogStale(value.stale); setCatalogState("ready");
      if (selected && value.models.some((item) => item.id === selected)) setModelId(selected);
      else if (provider !== null && target !== provider) setModelId("");
    } catch (error) { setCatalogState("error"); setMessage(error instanceof Error ? error.message : "Model catalog could not be loaded."); }
  }
  useEffect(() => { void loadSettings(); }, []);

  function changeProvider(next: Provider) {
    if (next === provider) return;
    setProvider(next); setModelId(""); setMessage("");
    void loadModels(next);
  }
  async function save() {
    if (!saved || !provider || !modelId) return;
    setSaving(true); setMessage("");
    try {
      const value = await api("/api/v1/coaching/ai-settings", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ provider, modelId, expectedRevision: saved.revision }) }) as Settings;
      setSaved(value); setProvider(value.provider); setModelId(value.modelId); setMessage("Saved for new feedback attempts.");
    } catch (error) { const text = error instanceof Error ? error.message : "Coach settings could not be saved."; setConflict(/settings changed|reload the saved selection/iu.test(text)); setMessage(text); }
    finally { setSaving(false); }
  }

  if (readState === "error") return <section className="coach-panel settings-panel" aria-labelledby="coach-ai-heading"><h2 id="coach-ai-heading">AI coach</h2><p className="coach-status coach-status--error" role="alert">{message}</p><button className="button button-secondary" type="button" onClick={() => void loadSettings()}>Retry saved coach settings</button></section>;
  return <section className="coach-panel settings-panel" aria-labelledby="coach-ai-heading">
    <div className="coach-panel-heading"><div><p className="eyebrow">Online activity feedback</p><h2 id="coach-ai-heading">AI coach</h2></div>{saved ? <span className="status-chip">Saved: {saved.provider} · {saved.modelId}</span> : null}</div>
    <p>Choose the provider and model used for new online workout feedback. Saving does not generate feedback or change past reviews.</p>
    {readState === "loading" ? <p className="quiet-copy" role="status">Loading saved coach settings…</p> : <>
      <div className="coach-form coach-form-grid">
        <label><span>Provider</span><select value={provider ?? ""} onChange={(event) => changeProvider(event.target.value as Provider)}><option value="openai">OpenAI</option><option value="openrouter">OpenRouter</option></select></label>
        <label><span>Search models</span><input type="search" placeholder="Search model name or ID" value={query} onChange={(event) => setQuery(event.target.value)} aria-controls="coach-model-list" /></label>
        <label className="field-wide"><span>Model</span><select id="coach-model-list" value={modelId} disabled={catalogState !== "ready" || catalogStale} onChange={(event) => setModelId(event.target.value)}><option value="">Choose a model</option>{saved && provider === saved.provider && !models.some((item) => item.id === saved.modelId) ? <option value={saved.modelId}>{saved.modelId} (currently saved; unavailable)</option> : null}{filteredModels.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.id}</option>)}</select></label>
      </div>
      {catalogState === "loading" ? <p className="quiet-copy" role="status">Loading compatible {provider} models…</p> : null}
      {catalogState === "error" ? <div><p className="coach-status coach-status--error" role="alert">{message}</p><button className="button button-secondary" type="button" onClick={() => provider && void loadModels(provider, modelId)}>Retry model catalog</button></div> : null}
      {catalogStale ? <div><p className="coach-status coach-status--error" role="alert">Showing a cached model list. Refresh before changing the selection.</p><button className="button button-secondary" type="button" onClick={() => provider && void loadModels(provider, modelId)}>Refresh model catalog</button></div> : null}
      <p className="field-help">OpenAI key: {saved?.credentials.openai ? "configured" : "missing (OPENAI_API_KEY)"}. OpenRouter key: {saved?.credentials.openrouter ? "configured" : "missing (OPENROUTER_API_KEY)"}. Configured does not confirm credits or access to a specific model.</p>
      {message && message !== "Saved for new feedback attempts." ? <><p className="coach-status coach-status--error" role="alert">{message}</p>{conflict ? <button className="button button-secondary" type="button" onClick={() => void loadSettings()}>Reload saved coach settings</button> : null}</> : null}
      {message === "Saved for new feedback attempts." ? <p className="coach-status coach-status--success" role="status">{message}</p> : null}
      <div className="coach-actions"><button className="button button-primary" type="button" disabled={!dirty || conflict || saving || catalogState !== "ready" || catalogStale || !modelId || !saved?.credentials[provider ?? "openai"]} onClick={() => void save()}>{saving ? "Saving…" : "Save coach settings"}</button></div>
    </>}
  </section>;
}
