# ORBIT post-run review — design package

28 October 2026 · Proposed design; application implementation is not included.

- [Open the clickable UX prototype](index.html)
- [Product-owner BRD](../../product/POST_RUN_REVIEW_BRD.md)
- [UX specification and screen flow](../POST_RUN_REVIEW_UX.md)

The prototype uses the approved ORBIT identity and synthetic workouts. It sends no account, AI or persistence requests. State is simulated within the open tab; reloading resets the demonstration. Open `index.html` in a browser, or serve the repository root with a local static server.

## Screens

| Preview | File |
| --- | --- |
| Review-first desktop arrival | [Desktop review](01-desktop-review.png) |
| Save current chat / review inline / defer | [Existing-chat choice](02-desktop-chat-choice.png) |
| Phone arrival | [Phone review](03-mobile-review.png) |
| Feedback saved; invitation removed | [Saved review](04-desktop-saved.png) |
| RPE and athlete feedback | [Phone form](05-mobile-feedback.png) |

## Try the journey

Choose **New run**, read the review, and select **Tell ORBIT how it felt**. Save first with no answers to inspect validation. Choose an RPE and discomfort answer, optionally add context, then save. **Simulate next login** should show normal conversation rather than repeat that run's invitation.

Choose **New run** again, then **Not now**. A later simulated login offers it again. **Existing chat** demonstrates the archive/inline choice. **AI pending** allows feedback before the assessment is ready. **Save error** fails the first valid save, preserves answers and permits retry. **Another new run** preserves the conversation and exposes manual review while respecting the consumed login allowance.

## Verification

The local Chromium interaction check covers asset loading, review-first arrival, required-field validation, successful save, completed-run suppression, deferral and later login, archive and inline choices, pending assessment, explicit unable/skip answers, failed-save retry, conditional pain fields, 390px and 320px reflow, unique element IDs and dialog Escape. No JavaScript errors were observed. Screenshots are captured from the HTML prototype.

These checks verify the simulated design only. Production acceptance still requires authoritative storage, idempotency, authentication, cross-tab behaviour, revision conflicts, real AI responses, focus/viewport handling and the full BRD acceptance matrix.
