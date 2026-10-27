"use client";
import { useEffect, useRef, useState } from "react";

export function SettingsSectionIndex() {
  const ref = useRef<HTMLElement>(null);
  const [sections, setSections] = useState<Array<{ id: string; label: string }>>([]);
  useEffect(() => {
    const parent = ref.current?.parentElement;
    if (!parent) return;
    const items = Array.from(parent.children).filter((element): element is HTMLElement => element instanceof HTMLElement && element.matches(".settings-group, .supporting-management"));
    setSections(items.map((element, index) => {
      const label = element.querySelector("summary,h2,h3")?.childNodes[0]?.textContent?.trim() || "Training tools";
      element.id ||= `settings-section-${index}`;
      return { id: element.id, label };
    }));
  }, []);
  return <nav ref={ref} className="settings-section-index" aria-label="Settings sections">{sections.map(section => <a href={`#${section.id}`} key={section.id} onClick={() => {
    const element = document.getElementById(section.id);
    if (element instanceof HTMLDetailsElement) element.open = true;
  }}>{section.label}</a>)}</nav>;
}
