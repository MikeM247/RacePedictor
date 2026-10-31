"use client";
import { useEffect, useRef, useState } from "react";
import {
  imageViewSchema,
  milestoneImageCatalogue,
  type ImageChoice,
  type ImageView,
} from "../../../../packages/core/src/contracts/milestone-images.ts";
import type { MilestoneEntry } from "../../../../packages/core/src/contracts/milestone-timeline.ts";
import {
  assignEntryImage,
  entryImage,
  sameImageChoice,
} from "../../../../packages/core/src/services/milestone-images.ts";
import { NativeModal } from "../coaching/native-modal";
async function responseData(response: Response) {
  const body = await response.json();
  if (!response.ok)
    throw Object.assign(
      new Error(
        body.error?.message ??
          "Image save could not be verified. Reload before trying again.",
      ),
      { reloadRequired: response.status === 409 || response.status >= 500 },
    );
  return body.data;
}
export function MilestoneImageEditor({
  entry,
  view,
  onSaved,
  onClose,
  onReload,
}: {
  entry: MilestoneEntry;
  view: ImageView;
  onSaved: (view: ImageView) => void;
  onClose: () => void;
  onReload: () => Promise<void>;
}) {
  const original = entryImage(view.state, entry);
  const [choice, setChoice] = useState<ImageChoice | null>(original.choice),
    [label, setLabel] = useState(original.label ?? ""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [blocked, setBlocked] = useState(false),
    [discard, setDiscard] = useState(false),
    [preview, setPreview] = useState<string | null>(null);
  const dirty =
    !sameImageChoice(choice, original.choice) ||
    label !== (original.label ?? "");
  const guard = useRef(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const draft = entryImage(
    assignEntryImage(view.state, entry.sources, choice, label),
    entry,
  );
  useEffect(
    () => () => {
      if (preview) URL.revokeObjectURL(preview);
    },
    [preview],
  );
  function close() {
    if (guard.current) return;
    if (dirty) setDiscard(true);
    else onClose();
  }
  async function upload(file: File) {
    if (guard.current) return;
    setError("");
    if (
      file.size > 5 * 1024 * 1024 ||
      !["image/png", "image/jpeg", "image/webp"].includes(file.type)
    ) {
      setError("Choose a PNG, JPEG or WebP image up to 5 MiB");
      return;
    }
    guard.current = true;
    setBusy(true);
    try {
      const bytes = await file.arrayBuffer();
      const hash = Array.from(
        new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
      )
        .map((x) => x.toString(16).padStart(2, "0"))
        .join("");
      const init = await responseData(
        await fetch("/api/v1/coaching/milestone-images/uploads/initiate", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            byteSize: file.size,
            checksum: hash,
            contentType: file.type,
          }),
        }),
      );
      let asset: {
        id: string;
      };
      if (init.mode === "local")
        asset = await responseData(
          await fetch("/api/v1/coaching/milestone-images/uploads/local", {
            method: "POST",
            headers: { "content-type": file.type },
            body: bytes,
          }),
        );
      else {
        const sent = await fetch(init.url, {
          method: "PUT",
          headers: init.headers,
          body: file,
          credentials: "omit",
        });
        if (!sent.ok)
          throw new Error("Image upload failed. Choose the file again.");
        asset = await responseData(
          await fetch("/api/v1/coaching/milestone-images/uploads/finalize", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ id: init.id }),
          }),
        );
      }
      setChoice({ kind: "upload", id: asset.id });
      setPreview(URL.createObjectURL(file));
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Image upload failed. Your saved image is unchanged.",
      );
    } finally {
      guard.current = false;
      setBusy(false);
    }
  }
  async function save() {
    if (guard.current || blocked) return;
    guard.current = true;
    setBusy(true);
    setError("");
    try {
      const next = imageViewSchema.parse(
        await responseData(
          await fetch("/api/v1/coaching/milestone-images", {
            method: "PUT",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              entryId: entry.id,
              expectedRevision: view.revision,
              sourceVersion: view.sourceVersion,
              choice,
              label,
            }),
          }),
        ),
      );
      window.dispatchEvent(new Event("milestone-images-changed"));
      onSaved(next);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Image save could not be verified.",
      );
      setBlocked(true);
    } finally {
      guard.current = false;
      setBusy(false);
    }
  }
  return (
    <NativeModal
      open
      titleId="milestone-image-title"
      onClose={close}
      busy={busy}
      className="milestone-image-dialog"
    >
      <header className="road-dialog-heading">
        <h2 id="milestone-image-title">Image for {entry.title}</h2>
        <button aria-label="Close image editor" onClick={close} disabled={busy}>
          ×
        </button>
      </header>
      <p>{entry.date ?? entry.completion.replace("_", " ")}</p>
      <div className="milestone-image-preview">
        {preview || draft.url ? (
          <img
            src={preview ?? draft.url!}
            alt={label || `${entry.title} preview`}
            width={66}
            height={66}
          />
        ) : (
          <span>
            {entry.achievement?.achievement === "personal_best" ? "PB" : "Race"}
          </span>
        )}
      </div>
      <p className="quiet-copy">
        Timeline preview · Your saved image changes only when you save.
      </p>
      <fieldset disabled={busy}>
        <legend>Choose existing image</legend>
        <div className="milestone-image-choices">
          {milestoneImageCatalogue.map((mark) => (
            <button
              key={mark.id}
              type="button"
              aria-pressed={
                choice?.kind === "catalogue" && choice.id === mark.id
              }
              onClick={() => {
                setChoice({ kind: "catalogue", id: mark.id });
                setPreview(null);
                setError("");
              }}
            >
              <img src={mark.url} alt="" width={50} height={50} />
              <span>{mark.title}</span>
            </button>
          ))}
        </div>
        <label>
          Descriptive label (optional)
          <input
            value={label}
            maxLength={200}
            onChange={(e) => setLabel(e.target.value)}
          />
        </label>
        <input
          ref={fileInput}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          aria-label="Upload milestone image"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (file) void upload(file);
          }}
        />
        <p className="quiet-copy">
          PNG, JPEG or WebP · up to 5 MiB · 64–4096 px per side.
        </p>
        <button
          type="button"
          className="text-link"
          onClick={() => {
            setChoice(null);
            setPreview(null);
          }}
        >
          Remove image override
        </button>
        <p className="quiet-copy">
          Removal restores the mapped catalogue image, or the default badge
          shown above.
        </p>
      </fieldset>
      {busy ? <p role="status">Uploading or saving image…</p> : null}
      {error ? <p role="alert">{error}</p> : null}
      {blocked ? (
        <button
          type="button"
          disabled={busy}
          onClick={async () => {
            try {
              await onReload();
              setBlocked(false);
              setError(
                "Saved images reloaded. Review your selection before saving again.",
              );
            } catch {
              setError("Reload failed. Retry before saving.");
            }
          }}
        >
          Reload saved images and milestones
        </button>
      ) : null}
      {discard ? (
        <div role="alert">
          <p>Discard your unsaved image choice?</p>
          <button onClick={onClose}>Discard changes</button>
          <button onClick={() => setDiscard(false)}>Keep editing</button>
        </div>
      ) : null}
      <div className="road-form-actions">
        <button
          className="button button-primary"
          disabled={busy || blocked || !!view.remoteState}
          onClick={() => void save()}
        >
          Save image
        </button>
        <button
          className="button button-secondary"
          disabled={busy}
          onClick={close}
        >
          Cancel
        </button>
      </div>
    </NativeModal>
  );
}
