# ORBIT responsive chat implementation

- Status: Implemented in `codex/orbit-chat-ui`
- Date: 28 October 2026
- Scope: Existing Coach chat and shared dashboard navigation

## Product and UX inputs

This implementation follows the Product Owner proposal for conversation-first mobile Coach (26 October 2026) and the UX/UI design based on the owner’s two mockups (27 October 2026). The mockup names, dates, training records and message text are illustrative references, not production data or instructions embedded in the images.

The Product Owner objectives are to remove the crowded mobile bottom bar and duplicated Coach chrome, keep navigation discoverable, reclaim room for messages and the composer, and preserve drafts and reading position. The UX/UI direction keeps a full desktop chat panel with the three conversation intents and selected training context. On phones it consolidates identity into the shared top bar, moves topic/context choices into a labeled sheet, exposes activity/session links above the composer, and uses a navigation drawer instead of bottom tabs.

## Implementation design

- `DashboardNavigation` owns the responsive application header and an overlay drawer. Existing destination links and feature gates remain authoritative. The drawer lists Home, Coach, Calendar, Readiness and Settings, shows the current route, closes on selection/outside interaction/Escape, and restores focus to its trigger.
- `CoachChatShell` remains the owner of conversation state, context selection, draft, sending, retry, archive and recovery behavior. It supplies ORBIT identity/status and conversation actions to the shared mobile header. Desktop keeps the intent controls, selected record, previous-chat/clear/check-in actions and training links visible.
- Mobile replaces the two horizontally scrolling topic/context rows with one subject launcher and a sheet containing full intent labels, selected record, next-session detail and the existing change/selection behavior. A separate labeled actions sheet opens Previous chats, the archive confirmation or Daily check-in one at a time.
- `NativeModal` provides modal focus containment, background inertness, Escape/outside dismissal and trigger focus restoration. This is shared by the navigation, context, action, history and confirmation surfaces.
- The chat panel is a bounded flex column. The transcript wrapper is the shrinkable scroll region; supporting links and composer remain in the panel. Mobile height follows `visualViewport` when available, respects safe-area insets and avoids opening the keyboard on entry. Text input remains 16px and grows to a capped height before it scrolls internally.
- Session storage stays scoped to the active athlete and retains the existing topic, selected record, unsent draft, generation and transcript position. Returning from navigation restores that state. New replies follow the latest message only when the reader was already near the end; otherwise an accessible “Latest message” action is offered.
- Clearing the current conversation keeps the existing archive operation. A confirmation explains that messages are saved to Previous chats and the unsent draft remains. Permanent deletion stays in Settings.
- The existing authenticated Coach endpoints and persistence lifecycle are unchanged. No API, database, authentication, training-plan or deployment behavior is added by this UI slice.

## Delivered acceptance coverage

| Objective | Implementation / evidence |
| --- | --- |
| Shared mobile navigation, selected route, focus return and no bottom bar | Shared navigation drawer; mobile E2E at 390px and 320px |
| Conversation-first mobile surface and persistent composer | Responsive Coach panel; screenshots at 390×844 and desktop 1440×900 |
| Context changes do not send or lose a draft | Topic/context sheet and preservation E2E |
| History, clear, retry and saved discussion behavior remain truthful | Existing APIs retained; archive/history/error E2E |
| Navigation restores draft, selected context and reading position | Home → Coach browser E2E |
| Screen-reader names and overlay usability | Axe scan plus dialog, keyboard dismissal and focus-return E2E |
| No page overflow at small widths or simulated keyboard height | 320px and 390×420 browser viewport checks |
| Tablet and short-landscape layout keep the composer in view | 360×640, 768×1024, 1024×768 and 844×390 viewport bounds |
| Large viewport and long transcript remain bounded | Desktop viewport and 40-message transcript E2E |
| Layout at 200% zoom-equivalent width | 640 CSS-pixel viewport check for a 1280px desktop viewport |

The verification used mocked online fixtures and Chromium. The zoom check represents the reduced CSS layout width; it does not change the browser’s native zoom setting. Real iOS Safari and Android Chrome keyboard, address-bar, safe-area, orientation, enlarged-text and screen-reader checks remain release validation because desktop Chromium cannot establish those behaviors.

## Architecture decision

See [ADR 0012](../adr/0012-responsive-orbit-chat-and-mobile-navigation.md) for the component boundaries, responsive layout choice, persistence boundary and trade-offs.
