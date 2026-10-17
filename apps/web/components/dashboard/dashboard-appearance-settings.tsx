"use client";

import { useEffect, useState, useRef } from "react";
import "./dashboard-appearance-settings.css";

const defaultImage = "/road-to-comrades.webp";

export function DashboardAppearanceSettings() {
  const [savedImage, setSavedImage] = useState(defaultImage);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "saving" | "error">("loading");
  const [message, setMessage] = useState("");
  const [retry, setRetry] = useState(0);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let active = true;
    void fetch("/api/v1/dashboard/appearance", { cache: "no-store" }).then(async (response) => {
      if (!response.ok) throw new Error("Your saved background could not be loaded.");
      return response.json() as Promise<{ data: { heroImageUrl: string } }>;
    }).then((body) => { if (active) { setSavedImage(body.data.heroImageUrl); setState("ready"); setMessage(""); } })
      .catch((error) => { if (active) { setState("error"); setMessage(error.message); } });
    return () => { active = false; };
  }, [retry]);

  useEffect(() => {
    if (!file) { setPreview(null); return; }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  async function save(reset = false) {
    if (state === "saving" || (!file && !reset)) return;
    setState("saving"); setMessage("");
    try {
      const response = await fetch("/api/v1/dashboard/appearance", reset ? { method: "DELETE" } : { method: "PUT", headers: { "content-type": file!.type }, body: file });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error?.message ?? "Your background could not be saved.");
      setSavedImage(body.data.heroImageUrl); setFile(null); if (input.current) input.current.value = "";
      setState("ready"); setMessage(reset ? "Default background restored." : "Background saved. It will appear on Home across your devices.");
    } catch (error) { setState("error"); setMessage(error instanceof Error ? error.message : "Your background could not be saved."); }
  }

  return <section className="dashboard-appearance-settings coach-panel" aria-labelledby="dashboard-background-heading">
    <header><p className="eyebrow">Make it yours</p><h3 id="dashboard-background-heading">Dashboard background</h3><p>Choose a photo that reminds you why you run.</p></header>
    <div className="dashboard-background-preview">
      {/* Authenticated image URLs must use the browser's own session. */}
      <img src={preview ?? savedImage} alt="Dashboard background preview" onError={(event) => { event.currentTarget.src = defaultImage; }} />
      <span>Every run has a reason.</span>
    </div>
    <label className="dashboard-background-file">Choose a background image<input ref={input} type="file" accept="image/jpeg,image/png,image/webp" disabled={state === "loading" || state === "saving"} onChange={(event) => {
      const selected = event.target.files?.[0] ?? null;
      if (selected && (!['image/jpeg', 'image/png', 'image/webp'].includes(selected.type) || selected.size > 4 * 1024 * 1024)) { setMessage("Choose a JPEG, PNG or WebP smaller than 4 MB."); setFile(null); event.target.value = ""; return; }
      setFile(selected); setMessage("");
    }} /></label>
    <p className="quiet-copy">JPEG, PNG or WebP · up to 4 MB. Landscape photos work best. Your goal and timeline stay live over the image.</p>
    <div className="dashboard-background-actions"><button className="button button-primary" type="button" disabled={!file || state === "saving" || state === "loading"} onClick={() => void save()}>{state === "saving" ? "Saving…" : "Save background"}</button><button className="button button-secondary" type="button" disabled={state === "saving" || state === "loading" || (!file && savedImage === defaultImage)} onClick={() => void save(true)}>Restore default</button></div>
    {state === "loading" ? <p role="status">Loading your background…</p> : null}
    {message ? <p role={state === "error" ? "alert" : "status"}>{message}</p> : null}
    {state === "error" ? <button className="text-link" type="button" onClick={() => setRetry((value) => value + 1)}>Reload saved background</button> : null}
  </section>;
}
