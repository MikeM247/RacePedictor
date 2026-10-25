# V2 Screen Design Brief: Three Visual Directions

Date: 22 October 2026\
Status: Final AI Companion direction and humanoid male ORBIT images approved for the future site; not implemented.\
Product references: [V2 product design](../product/V2_PRODUCT_DESIGN.md), [first iteration](../product/V2_FIRST_ITERATION.md), [flow diagrams](../product/V2_FLOW_DIAGRAMS.md).

Visual boards: [Comparison gallery](v2-concepts/index.html) · [Design pack](v2-concepts/README.md)

Selected implementation reference: [Approved layout and architect handoff](../plans/V2_AI_COMPANION_DESIGN_HANDOFF.md). It supersedes unresolved visual choices in this exploration brief.

## Design intent

Make the runner feel that the coach remembers the relevant training context, asks a useful question, and makes the next step easy. Conversation is the first interaction. The approved goal, last recorded activity, and next effective session remain visible enough to orient the runner and support direct navigation.

All three concepts express the same first-iteration product. Visual personality changes; the coaching workflow and authority of the existing plan do not.

The Product Owner selected AI Companion and approved the final character and interface images for future use. The [22 October V2 amendment](DESIGN_INTENT_CONTRACT.md) records this direction; the [architect handoff](../plans/V2_AI_COMPANION_DESIGN_HANDOFF.md) describes the chosen layout in detail. Conversation-first arrival changes the V2 large Home goal/achievement composition and automatic daily check-in interruption. Application implementation remains separate.

## Shared illustrative fixture

All values below are synthetic design examples. They are not assertions about the athlete's actual training, approved plan, race, or fitness.

| Context | Example shown across concepts |
| --- | --- |
| Current date | Thursday, 22 October 2026, Africa/Johannesburg |
| Approved race goal | Spring 10K · 1 November 2026 · Under 60 min |
| Last recorded activity | Wednesday, 21 October · Easy run · 8.0 km · 48:00 · 6:00/km |
| Next effective session | Friday, 23 October · Easy run · 45 min · Conversational effort |
| Reflection message | “The last part felt harder.” |
| Reflection follow-up | “Was that your breathing, your legs, or both?” |
| Preparation message | “What should I focus on tomorrow?” |
| Preparation answer | “Keep it conversational for the planned 45 minutes.” |

“Conversational effort” is example supplied plan guidance, not a new instruction inferred from a mockup. Do not label the last recorded activity as completion of the next planned session or infer adherence from its metrics. Example data is labelled at the gallery or concept-board level so it is not mistaken for a live dashboard.

## Screen and state inventory

The first iteration introduces one conversation-led Coach screen at the existing `/dashboard` route, with the states below. It does not require three new chat pages or a redesigned Calendar.

| ID | Screen or state | What the athlete sees | Main transition |
| --- | --- | --- | --- |
| C01 | Coach arrival | Compact goal orientation; last/next context; contextual opening; free-text composer and starter prompts. | Choose reflection, preparation, type a question, or navigate directly. |
| C02 | Reflect on last training | Selected recorded activity; a saved message exchange; a focused follow-up; available activity action. | Continue talking, switch topic, or open existing activity detail. |
| C03 | Prepare for next training | Selected future session; supplied purpose/prescription; a useful exchange about the session; session action. | Continue talking or open the exact Calendar date/session. |
| C04 | Existing detail handoff | Existing activity detail or Calendar/session detail, entered from the conversation with exact record context. | Ordinary Back/navigation returns to the saved conversation. |
| C05 | Resumed Coach | Same transcript, draft, and selected context; refreshed facts after any confirmed change in another view. | Continue without a repeated greeting or forced check-in. |
| C06 | Optional wellbeing | Existing check-in/journal form opened deliberately from a contextual link. | Existing explicit save or cancel returns to Coach. |
| C07 | Chat unavailable or delayed | Known training facts, saved transcript, recoverable draft, retry, and usable direct destinations. | Retry chat or use Calendar/plan without chat. |

Race plan remains at the existing plan route. Calendar, Readiness, and Settings keep their existing roles. **View race plan** is available without sending a message. New **Discuss with coach** launchers inside existing screens remain outside iteration one.

## Shared layout and content specification

### Desktop: 1440 × 1000 reference

Use the existing navigation location and retain the established destination model. The proposed Home label becomes **Coach**; Calendar and Readiness remain primary and Settings secondary.

The main content has a comfortable reading column of approximately 660–760 px. A narrow companion context column may carry last/next training on a wide desktop, but the transcript remains the dominant element. Do not turn the right column into a second dashboard of charts and scores.

Reading order:

1. Small page title and date, then compact goal orientation with **View race plan**.
2. Last/next context controls, using full dates rather than only “yesterday” or “tomorrow”.
3. Visible selected-context label, such as **Discussing: Easy run · Wed 21 Oct**.
4. Coach opening or resumed transcript, followed by contextual actions.
5. Clearly labelled message composer with a visible Send button.

The goal banner should be short enough that the first meaningful coaching question and the composer are visible together in a typical desktop reference case. An image or character introduces the tone; it must not consume the screen above the conversation.

### Mobile: 390 × 844 reference

Use one column with compact goal orientation and a stacked or wrapping last/next selector. Keep the selected record visible when the athlete switches between reflection and preparation. The bottom navigation retains Coach, Calendar, and Readiness; Settings stays in its existing utility position.

The composer belongs above the navigation and keyboard, with safe-area clearance. When the keyboard opens, the recent exchange and input must remain reachable without losing the scroll position. Use page flow or a deliberate conversation viewport; avoid nested scrolling panes that trap the athlete.

At 320 px width or 200% zoom, permit vertical scrolling and wrapping. Do not clamp prescribed instructions, hide material cautions, or shrink text to keep the design within a fixed image.

### Arrival

Opening example: **“How did yesterday's run feel?”** The nearby context supplies the actual date and activity facts. Use a short follow-up sentence only if it adds something supported.

Starter prompts: **Reflect on last training** and **Prepare for next training**. Keep them secondary to conversation rather than rendering both as competing filled primary buttons. Free-text input is always available.

If the athlete already reflected on this activity, resume or move to next-session preparation rather than repeating the same question. Do not show a duplicate wellbeing modal before this interaction. Invite the existing check-in when relevant; preserve saved/skipped states and later editing.

### Reflection

Show the selected activity's title, occurrence date, and a concise set of recorded facts. A compact label such as **Recorded activity** is clearer than a success badge implying plan completion.

Use the sample exchange from the fixture. The coach asks one focused follow-up rather than combining effort, sleep, pain, nutrition, and schedule into a questionnaire. **View activity** opens the real activity detail. A published review is used only when current and actually available; otherwise the conversation can work from the athlete's reply and recorded facts.

### Preparation

Show **Fri 23 Oct · Easy run · 45 min**, the supplied conversational-effort guidance, and any actual essential cautions. Keep **View session** as the main contextual action and **View race plan** secondary. The coach can explain the planned session; the mockup must not imply that answering a question edits the prescription.

If a constraint leads to a suggested alternative, label it as a suggestion. Eligible future-session changes go through Calendar's existing reason-required form. Goal or wider plan changes follow the existing proposal/approval workflow. Do not introduce an Apply button in chat.

### Detail and return continuity

The contextual action opens the exact record, including its Calendar date/session or activity identity. Keep the existing full detail and available actions rather than inventing a new “AI version” of the same workout.

On return, restore the transcript, selected training context, draft, and focus. Refresh effective session facts after a confirmed change. A quiet **Session details refreshed** note is appropriate only when there was a real change; a routine unchanged return needs no notification.

## Direction A: Night Ops — familiar evolution

**Character:** focused, athletic, recognisably the existing product.

- Retain deep navy page surfaces, matte bordered panels, cyan interaction, restrained lime recorded/success accents, and the existing brand.
- Use the road-at-dawn image as a shallow goal banner or a small contextual crop. Keep the conversation above the fold instead of recreating the large achievement hero.
- Use the current sans-serif hierarchy, calmer spacing, native-looking controls, and familiar sidebar/bottom navigation.
- Coach messages use a small cyan coach mark and lightly differentiated panel background. User messages use a muted raised navy surface.
- Let the transcript, not card decoration, carry the experience. Context facts are compact and consistent with current Calendar typography.

**Strength:** easiest transition from the current app and the smallest visual implementation risk.\
**Trade-off:** less distinctive as a new coaching product; most of the change is in interaction rather than brand.

**Visual-generation brief:** A polished running-coach web application based on the existing Road to Comrades screenshot. Preserve matte dark navy, cyan borders and buttons, lime recorded-state cues, understated brand and dawn-road photographic atmosphere. Create a compact goal banner, a large readable coaching transcript, last/next training controls, and a grounded message composer. Show desktop arrival, reflection and preparation state thumbnails, plus mobile. Use the shared sample fixture exactly. No neon dashboards, prediction gauges, dense telemetry, or giant hero that pushes chat out of view.

## Direction B: ORBIT — a friendly AI companion

**Character:** clearly an AI coach, composed and approachable rather than theatrical.

- Use graphite/ink surfaces with glacier cyan and soft lilac accents. Retain strong contrast and restrained matte materials.
- Introduce ORBIT as an original mature male humanoid running coach: natural facial contours, a skin-like synthetic face, blue eyes with visible irises, subtle age lines, and a defined jaw. Brushed-silver temple framing, a restrained cyan cadence arc, and the graphite/pearlescent performance suit retain his futuristic identity. His presence should suggest an experienced, sophisticated endurance coach while retaining lean athletic proportions and an approachable expression. Avoid resemblance to a known film or game character. See the [refined character sheet](v2-concepts/02-orbit-character.png).
- In a quiet arrival header, a modest portrait can greet the athlete. Inside the transcript, reduce it to a 32–48 px avatar. A full character beside every message would crowd the conversation.
- Keep expression and motion subtle. A typing state means only that a reply is being generated; it must not imply live monitoring, emotional sensing, or physiological analysis.
- The character is decorative support. Every action, status, and message remains understandable without it; reduced-motion users see a static avatar.

**Strength:** makes the AI coaching presence tangible and memorable.\
**Trade-off:** more asset and motion work, and a greater risk of the character competing with serious training content.

**Visual-generation brief:** High-fidelity conversational running coach interface, ORBIT direction. Original mature male athletic humanoid with natural facial contours, a skin-like synthetic surface, blue eyes, subtle age lines, and a calm experienced expression. Brushed-silver temple framing and low-profile cyan accents retain his cybernetic identity. Pearlescent shell and graphite performance joints. Show his athletic stance on the character sheet and use compact head-and-shoulders avatars in chat. Preserve the graphite shell, glacier conversation surfaces and restrained soft lilac. Same hierarchy and sample data as the familiar direction. The screen clearly shows contextual coaching messages, actual recorded activity and next session, persistent composer, and existing Calendar/plan navigation. Avatar accompanies the chat; it does not replace content or create live-sensor claims.

## Direction C: Field Notes — the running journal

**Character:** warm, reflective, outdoors-oriented, quietly premium.

- Use warm ivory paper, forest-green ink, soft sand surfaces, and a small burnt-orange accent. Preserve readable contrast rather than using pale grey text for an “editorial” effect.
- Pair an expressive but readable serif heading with a practical sans-serif for messages, metrics, and controls. This is a digital coach with journal warmth, not handwriting that is difficult to read.
- Make the transcript an editorial reading column with dated dividers, generous margins, understated coach initials/mark, and terracotta-tinted user replies.
- Use a subtle contour-line or route-line motif in the goal band. It is atmospheric art, not a claim about an actual GPS route or a new planning map.
- Reference the outdoors through paper, typography, and a small landscape crop. Avoid a lifestyle photograph filling the viewport above the conversation.

**Strength:** distinguishes RacePredictor from technical dashboards and creates a calm setting for reflection and preparation.\
**Trade-off:** the largest visual departure; existing dark Calendar/detail views need a deliberate transition until broader styling is separately scoped.

**Visual-generation brief:** High-fidelity running-coach app imagined as a contemporary endurance field journal. Warm ivory paper, deep forest ink, terracotta accents, elegant readable editorial headings, disciplined sans-serif messages, subtle topographic contour art in a narrow goal band. Conversation is the main content. Use the same sample goal, dates, recorded run, next session, and message exchange as the other directions. Show desktop arrival and smaller reflection, preparation, and mobile states. No readiness gauges, fake route data, automatic plan-adjustment action, or redesign of Calendar.

## Recommendation

**Product Owner approval, 22 October 2026:** Use AI Companion and the final futuristic, athletic male ORBIT character with an older, more sophisticated and slightly more humanoid appearance. Natural facial surfaces and expression soften the mechanical features while preserving the established body, cybernetic details, and interface's look and feel. Approved dated images and the selected layout are pinned in the [architect handoff](../plans/V2_AI_COMPANION_DESIGN_HANDOFF.md). This approval does not initiate application implementation.

Use **Direction A** if the first release should prioritise familiarity and modest visual change. Use **Direction C** if V2 should establish a distinctive long-term coaching identity; it is the strongest surprise direction because its calmer tone supports the actual reflective workflow. Keep the same information hierarchy in either case.

Direction B is the best fit when the athlete specifically wants a recognisable AI companion. The robot can also become an optional presentation layer later; the coaching experience should remain usable and credible without a character.

AI Companion is selected for implementation planning. Night Ops and Field Notes remain historical alternatives, not additional themes to ship.

## Review of the initial visual boards

The generated boards distinguish the three directions and use the shared illustrative training values. They communicate appearance and layout rather than guaranteeing exact production controls or copy. A refinement pass removed out-of-scope attachments, reduced the active-chat robot, removed its repeated opening, clarified message roles, and improved mobile context and plan access. A subsequent clickable prototype and implementation should observe these requirements:

- **Across directions:** Keep last/next context switching discoverable during an active conversation, not just at arrival. Keep **View race plan** reachable on the mobile reflection state as well as preparation.
- **Night Ops:** Preserve the existing palette and photographic cue, but keep gradients restrained and the transcript in focus. The preparation state may contain an earlier reflection message as saved history; the currently selected session must remain explicit.
- **ORBIT:** Use only one opening question at arrival. Avoid duplicating the same greeting in a large mascot header and the transcript. Shrink the character to avatar scale when a conversation is underway, and check the contrast of soft blue action surfaces.
- **Field Notes:** Attachment/paperclip controls in the initial generated image were removed in the final board; they remain outside iteration scope. “Reflect” and “Prepare” are states of the same Coach screen, not separate routes.
- **Existing views:** Calendar, activity detail, and race plan remain the current product views. A concept gallery may use illustrative navigation previews to explain continuity, but must identify those previews rather than suggest that those screens have been rebuilt or connected to live data.

The comparison gallery displays static boards. It is not a clickable training-flow prototype. None of these boards demonstrates a functioning AI coach, saved message service, or structured training write. A later interactive prototype should label any sample interactions as illustrative.

## Design review and handoff checklist

- [ ] Every board uses the same clearly illustrative fixture and the same product scope.
- [ ] Coach arrival, reflection, preparation, existing-detail handoff, and return are understandable as one journey.
- [ ] Goal orientation and last/next context are visible without overpowering the conversation.
- [ ] Free text is available and selecting a prompt does not lock the athlete into a questionnaire.
- [ ] Selected activity/session date is explicit; recorded data is not labelled as adherence or completion.
- [ ] Current prescription and a conversational suggestion cannot be mistaken for each other.
- [ ] Calendar and race plan remain directly available before or during chat.
- [ ] No in-chat plan approval, amendment, structured wellbeing write, or new notification channel is invented.
- [ ] Saved wellbeing is respected; the existing form opens only on request in the V2 entry.
- [ ] Back restores the same conversation, selected record, draft, and keyboard focus.
- [ ] Pending/stale/unavailable review and chat-failure states preserve useful facts and navigation.
- [ ] One filled primary action per active workflow step; secondary actions remain discoverable.
- [ ] Body text and message content are readable at normal size; 44 px touch targets, keyboard navigation, contrast, and reduced motion are supported.
- [ ] Mobile composer clears the bottom navigation and on-screen keyboard; 320 px and 200% zoom permit reflow without clipping.
- [ ] Robot or contour art has no informational meaning required to understand the workflow.
- [ ] New Coach visual states are identified separately from existing Calendar/plan screens in the implementation handoff.

Use the approved architect handoff's component/token baselines, state requirements, and responsive acceptance in the implementation plan. Verify detailed component measurements and accessibility during implementation. The dated design-contract amendment is recorded; the visuals do not demonstrate an implemented chat runtime or persisted conversation service.
