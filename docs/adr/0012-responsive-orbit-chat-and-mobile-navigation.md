# ADR 0012: Responsive ORBIT chat and shared mobile navigation

- Status: Accepted through the owner's implementation request
- Date: 28 October 2026
- Related implementation: [ORBIT responsive chat implementation](../plans/ORBIT_RESPONSIVE_CHAT_IMPLEMENTATION.md)

## Context

The owner’s mockups establish a spacious desktop chat and identify that the mobile screen is crowded by duplicated headers, topic/context controls and bottom navigation. The Product Owner brief prioritizes mobile conversation space and continuity. The UX/UI design specifies one shared mobile header, a compact context launcher, labeled sheets and a persistent composer.

The app already has an authenticated Coach conversation, context APIs, athlete-scoped session persistence, retry/history flows and feature-gated destinations. The UI must reuse these contracts. Example labels and training records in mockups are not a source of athlete data.

## Decision

Keep `CoachChatShell` as the single owner of chat and context behavior. Extend `DashboardNavigation` to provide the shared mobile header and an overlay destination drawer. Use the existing `NativeModal` for the drawer and Coach action/context/confirmation surfaces so focus containment, background inertness and dismissal behavior are consistent.

Use responsive CSS at three ranges: mobile at 767px and below, tablet at 768–1199px, and the existing desktop rail at 1200px and above. On mobile, the Coach panel fills the space below the shared 64px header. A single context launcher opens a sheet with complete labels and selected context; a conversation-actions button opens Previous chats, Clear chat and Daily check-in. Desktop retains visible intent, context and history controls. Training context links remain adjacent to the composer.

Make the chat panel a bounded flex column with a shrinkable transcript wrapper. Keep the transcript, not the document, as the reading scroll area. Size the mobile panel from `visualViewport` where supported, with CSS viewport and safe-area fallbacks. Use existing session storage for continuity and preserve the existing API contract for sends, retries and archived chats.

Use Coach-specific compound selectors alongside the shared dashboard classes. Next.js client navigation can alter stylesheet insertion order; the higher specificity keeps shared `.dashboard-layout` and `.dashboard-main` rules from turning the conversation panel back into a document-sized flow. The E2E suite covers returning Home → Coach to protect this behavior.

## Consequences

- The design uses no new backend or data contract and does not change approved training plans.
- Mobile topic and history controls take one extra interaction; the current subject and recognizable actions remain visible.
- The app’s existing archive action is explained accurately; permanent history deletion remains in Settings.
- Mobile/browser behavior adapts to the visual viewport where the platform exposes it, while transcript reading stays independently scrollable.
- Chromium verifies narrow viewports and a 640 CSS-pixel zoom-equivalent layout. Native mobile keyboard, browser chrome, safe-area and assistive-technology behavior must still be verified on real iOS and Android devices before release.
