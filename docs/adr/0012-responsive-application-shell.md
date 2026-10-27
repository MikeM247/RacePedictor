# ADR 0012: Persistent responsive application shell

Date: 26 October 2026

Status: Accepted by the owner-approved implementation plan.

## Context

Mobile branding, duplicated page/Coach headings and a wrapping bottom menu displaced the conversation. Separately composed page shells and navigation-specific modal isolation made a consistent redesign fragile. The owner approved a shared shell, full-page presentation refresh and optional expanded desktop navigation.

## Decision

The dashboard server layout retains runtime feature selection and wraps its children in a persistent client ApplicationShell. One destination registry drives the header, drawer and rail. Below 768px use a 56px navy header and a labeled left drawer; at larger widths default to a 64px icon rail with explicit 180px expansion. Store only that browser preference, with a safe in-memory fallback. Coach's existing runtime and sending gates remain separate.

The shell owns the single main landmark and page H1. Content adapters retain existing data loading and actions. Ordinary pages keep document scrolling and existing recovery identifiers. Coach uses a visual-viewport-sized transcript and anchored composer; resizing the rail does not remount its controller. Calendar's independent 1200px detail threshold remains unchanged.

Native sheets reuse NativeModal, with explicit focus-return targets and one active native overlay owner. Existing portaled details use the same reference-counted background isolation and scroll lock. Nesting an activity detail above Day details preserves the underlying modal's isolation until the child closes.

Shared semantic tokens provide light content, forms, charts and dialogs beneath navy navigation. Home retains its scenic hero and live milestone journey. Archive/history, approval, provider, authentication and data authority remain in their existing layers. No schema or API changes are needed.

## Consequences

- Navigation state survives client route changes. Icon-only links retain accessible names, focus/hover tooltips and current-route markers.
- Page-specific duplicated navigation, old bottom-bar compensation, Home's transparent header exception and Plan/Calendar's navigation-specific inert effects are removed.
- Shell and content styles must remain distinct; new pages use the destination registry rather than mounting another navigation instance.
- Rollback is a frontend release rollback. Existing browser chat storage and backend records stay compatible.
- Desktop browser keyboard simulations do not establish native iOS/Android behavior; physical-device acceptance remains explicit in the validation record.
