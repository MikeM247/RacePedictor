# Race Predictor Design System Rules

Implementation guide · 12 September 2026

This document expands [DESIGN_INTENT_CONTRACT.md](DESIGN_INTENT_CONTRACT.md) and [SCREEN_SPECIFICATIONS.md](SCREEN_SPECIFICATIONS.md). It is binding for visual and component implementation. It preserves the dark, matte Night Ops direction and does not introduce a new visual identity.

## Implementation baseline

- Use shared semantic tokens rather than page-specific colors, spacing, or typography.
- Prefer shared React components with explicit variants and states over duplicated page CSS.
- Use native HTML controls where they provide the required behavior. Add styling and semantics without replacing keyboard/browser behavior unnecessarily.
- Component APIs should expose state explicitly: `loading`, `empty`, `error`, `stale`, `pending`, `success`, `disabled`, or `unavailable` as applicable.
- Content determines emphasis. Do not add a component, badge, chart, animation, or control unless it helps answer a defined user question.
- Home remains three groups in order: Race outlook, Recent training, Next action. Do not use this document to reintroduce a KPI dashboard.

## 1. Colour usage rules

### Semantic palette

Use the existing token family as the baseline. Values may be tuned for contrast, but roles and meanings must remain stable.

| Token role | Existing baseline | Use |
|---|---|---|
| `--rp-bg` | `#07111d` | App background and deepest surface. |
| `--rp-nav` | `#081522` | Primary navigation surface. |
| `--rp-surface` | `#0e1b2b` | Standard panels and controls. |
| `--rp-surface-raised` | `#132438` | Selected/raised surface and focused context. |
| `--rp-surface-soft` | `#0a1725` | Quiet inset regions. |
| `--rp-border` | `#293b4e` | Default borders and separators. |
| `--rp-border-strong` | `#3c5268` | Emphasized boundaries and controls. |
| `--rp-text` | `#f5f8fc` | Primary text and key values. |
| `--rp-text-muted` | `#a9b6c6` | Supporting text and metadata. |
| `--rp-cyan` | `#20c7f5` | Primary interaction and active navigation. |
| `--rp-cyan-strong` | `#67ddff` | Focus and high-contrast interaction state. |
| `--rp-violet` | `#9b78ff` | Category, review, and secondary analytical emphasis. |
| `--rp-lime` | `#9ddd3b` | Confirmed/healthy/actual state. |
| `--rp-amber` | `#f4b942` | Caution, stale, queued, or needs attention. |
| `--rp-danger` | `#ff6577` | Error, destructive action, and failed state. |
| `--rp-focus` | `#67ddff` | Visible keyboard focus. |

Rules:

- Use semantic token names in component styles. Do not use literal hex colors in feature components.
- Color supplements text and icons; it never carries state alone.
- Cyan is reserved for interaction, current selection, and primary action. Do not use it to decorate every metric.
- Lime means confirmed/healthy/actual, not “better performance” unless the data explicitly supports that claim.
- Amber means caution or attention, not failure. Red means an error or destructive consequence.
- Violet identifies a category such as Coach's review; it must not imply confidence or plan approval.
- Keep surfaces solid and matte. Do not add gradients, translucent glass, persistent glows, or decorative color washes.
- Use a tinted surface or border for state only when the accompanying text names the state.
- In forced-colors mode, borders, focus, and selected state must remain perceivable using system colors.

## 2. Typography hierarchy

Use one sans-serif family consistently: Inter when available, then the existing system fallback stack. Use tabular numerals for dates, times, distances, paces, percentages, and counts.

| Role | Size | Weight | Use |
|---|---:|---:|---|
| Page title | 24–28px | 700 | One H1 per screen. |
| Section title | 18–20px | 700 | Major content groups and panels. |
| Subsection title | 15–16px | 700 | Detail blocks and form sections. |
| Body | 16px | 400–500 | Conclusions, explanations, and primary content. |
| Control label | 14–16px | 600 | Persistent form labels and button text. |
| Metadata | 13–14px | 400–600 | Date, source, status age, version, and supporting facts. |
| Eyebrow | 12–13px | 700 | Short category label above a heading; never the only label. |

Rules:

- Headings describe the user's task or content, not internal component names.
- Use sentence case. Avoid all-caps for meaningful content; uppercase is limited to short eyebrow labels.
- Keep Home commentary to 2–3 short sentences, normally no more than 80 words.
- Use bold for the takeaway or key value, not entire paragraphs.
- Maintain line length around 60–80 characters for narrative content. Do not make essential copy smaller to fit more content.
- Use `line-height: 1.45` or greater for body copy and at least 1.2 for headings.
- Distinguish recorded facts from interpretation through labels and wording, not merely font color.

## 3. Spacing rules

Use the shared 4px rhythm:

`4px · 8px · 12px · 16px · 24px · 32px`

Rules:

- 4px: icon-to-label or compact internal adjustment.
- 8px: related label/value pairs, list rows, button groups, and compact metadata.
- 12px: field groups, panel header-to-body spacing, and summary internals.
- 16px: standard panel padding, section spacing on compact screens, and form row gaps.
- 24px: page gutters on wide screens, major section separation, and panel-to-panel spacing.
- 32px: page-level separation or the end of a major workflow section.
- Wide content uses a maximum width of 1280px and 24px gutters.
- Compact content uses 16px gutters.
- Do not introduce arbitrary one-off values unless required by native control rendering or an accessibility target.
- Keep at least 8px between adjacent controls and at least 16px between unrelated actions.
- Use consistent vertical rhythm inside all panel types. A panel with more data may grow; it must not compress the base rhythm.

## 4. Card and panel patterns

### Standard panel

Use a panel for one coherent question or workflow step:

1. Optional eyebrow/category.
2. Heading and short purpose.
3. Optional status/action row.
4. Content body.
5. Optional footer link or secondary action.

Rules:

- Background: `--rp-surface`; border: 1px solid `--rp-border`; radius: 8–10px; padding: 16px.
- Use `--rp-surface-raised` only for selected, focused, or active content.
- Do not nest panels solely for decoration. Use spacing, a divider, or a heading for internal structure.
- A panel is not automatically clickable. Make only the intended link/button interactive.
- The panel header must identify the content without requiring the user to inspect metadata.
- Home uses three panels/groups only. Secondary evidence opens within the relevant detail surface.
- Do not use a panel for a single line of status if an inline status component is sufficient.
- Avoid large empty hero panels, decorative gauges, and equal-size KPI tiles without a clear decision purpose.

### Summary panel

Required anatomy: heading, conclusion, supporting reason, material caveat/state, and one detail link when detail exists. A summary must be understandable without opening the detail.

### Detail panel

Open from a summary with context. Show the detail heading, key facts, interpretation, and evidence in that order. Include an explicit Back/Close action when it replaces the parent context.

### Dialog panel

Use only for focused confirmation or contextual detail that must preserve the underlying location. It must have a named title, inert background, focus management, a visible close/cancel action, and no nested dialog.

## 5. Button hierarchy

Use three visual levels only:

| Level | Appearance | Use |
|---|---|---|
| Primary | Solid cyan fill, dark text | One consequential or next-step action for the current screen/state. |
| Secondary | Bordered raised surface, light text | Legitimate alternative, navigation, or lower-priority action. |
| Text/link | Text with visible hover/focus treatment | Detail, Back, supporting navigation, or non-consequential continuation. |

Rules:

- At most one primary button is visible for the active screen or workflow step. A dialog may have one primary confirmation action.
- A read-only state such as rest or “no action needed” may have no primary button.
- Button labels describe the result: `View session`, `Import file`, `Approve plan`, `Retry activity`, `Open Calendar`.
- Avoid `Go`, `Process`, `Submit`, `Continue` without context, and icon-only primary actions.
- Destructive actions use the danger semantic and a confirmation dialog naming the target and consequence. Do not style rejection or deletion as a casual link.
- Disable a submitting button while the request is pending. Explain why it is disabled when the reason is not obvious.
- Minimum target is 44×44px including padding. Buttons may be full width on compact screens for primary form actions.
- Keep button groups in a stable order: primary, secondary, then cancel/back where appropriate. Do not move actions when state text changes.
- Do not use pills for ordinary buttons. Status chips may be compact but are not buttons.

## 6. Form patterns

Rules:

- Use persistent labels above inputs. Placeholder text is an example, never the label.
- Place helper text directly below the control and validation text next to the invalid field.
- Use native `input`, `select`, `textarea`, `fieldset`, and `legend` where appropriate.
- Group fields by the current workflow step. Do not show the entire Plan creation form, proposal review, and history at once.
- Use the existing supported defaults, including the configured timezone and routine defaults. Do not add fields solely to fill space.
- Keep one primary submit action per form step. Label it with the outcome.
- Validate required fields before submission and retain entered values after recoverable failure.
- Server validation remains authoritative. Display server errors in the relevant field or form region without exposing raw stack traces or internal IDs.
- File inputs state format and size/count constraints before selection. GPX must state the one-activity-per-file rule.
- Checkbox groups use `fieldset`/`legend`; date and numeric inputs expose units and timezone meaning.
- Use `aria-describedby` for help/errors and `aria-invalid` for invalid fields.
- On invalid submit, focus the first invalid field. On success, announce the result and expose the next relevant destination.
- Do not reset a form after a failed request. Reset only after confirmed success when the next state no longer needs the inputs.

## 7. Table and list patterns

### Training list

- Use a semantic list/table appropriate to the content. Each row has one clear selection target and accessible name.
- Sort recent-first by activity date by default. Show date, title, distance, duration, pace, and available review/status cue; keep secondary telemetry out of the row.
- Do not use color alone for review status or selected state.
- Preserve the list, selected row, filters, and scroll position while detail loads.
- On compact layouts, replace the list with detail and offer Back to training.
- Use Load more only when continuation exists; label the end of history explicitly when there is no more data.

### Comparison table

- Use columns `Measure`, `Planned`, `Recorded`, and `Interpretation` only when a supported plan comparison exists.
- Label absent values as `Not available` or explain why comparison is not possible. Never use zero as a placeholder.
- On compact screens, stack each row into labeled blocks; do not force horizontal scrolling.

### General tables/lists

- Left-align labels and narrative; align numeric values consistently and use tabular numerals.
- Use borders and spacing for grouping. Avoid excessive badges, alternating color, and decorative icons.
- Provide a text heading and summary before a large list. Filters are collapsed until requested.
- Empty filtered lists explain the active filter and offer Clear filters.

## 8. Status badge patterns

Status badges communicate a state; they do not replace the state explanation or become a primary action.

| Semantic state | Token | Example labels |
|---|---|---|
| Healthy/current/confirmed | Lime | `Current`, `Connected`, `Approved`, `Ready` |
| Active/selected | Cyan | `Active`, `Selected`, `Current plan` |
| Review/category | Violet | `Coach's review`, `Draft`, `Plan comparison` |
| Caution/stale/queued | Amber | `Stale`, `Waiting`, `Queued`, `Action needed` |
| Error/attention failure | Red | `Error`, `Unavailable`, `Retry needed` |
| Neutral/information | Muted text/border | `Not reviewed`, `No plan linked`, `Not configured` |

Rules:

- Use a short text label plus an optional icon; never use a color dot alone.
- Place the badge next to the content it qualifies, not in a distant global toolbar.
- Do not label a queued operation `Complete`, a draft `Active`, or a current estimate `Race prediction` unless the data supports that exact claim.
- Do not show multiple badges for the same semantic state. Combine only when states are genuinely independent, such as `Connected` plus `Backfill queued`.
- Badges are non-interactive by default. If the user can act, use a button or link with a status label.
- Status changes are announced only when meaningful; unchanged polling must not repeatedly announce.

## 9. Prediction confidence indicators

Confidence is explanatory context, not a decorative score.

Rules:

- Always pair the prediction/outlook with target, assessment timeframe, evidence basis, and material limitation.
- Prefer plain text: `Based on the last 8 weeks of imported running history`; `Confidence is limited because recent long-run data is incomplete`.
- Use a supported range only when the prediction/data source supplies a calibrated range. Label what the range means; do not invent an interval.
- Use a qualitative label only when the underlying contract supplies that category. Do not invent `High`, `Medium`, or `Low confidence` as a design convenience.
- Never use a ring, meter, gauge, traffic light, or percentage as a visual shortcut for unsupported confidence.
- A freshness badge is not a confidence indicator. Show `Updated 2 days ago` separately from any uncertainty explanation.
- Confidence unavailable, insufficient history, incompatible target, and stale estimate are distinct states.
- If a current-fitness estimate is available but a race-date forecast is not, label it as current fitness and do not compare it to the target as if it were a guaranteed race result.
- The confidence explanation must link to relevant evidence/assumptions and, where actionable, a supported Data Quality recovery.

## 10. Chart and metric display rules

### Metrics

- Display a metric only when it answers the current question. Home should prefer one or two key values inside a summary; activity detail may show up to four first: distance, duration, pace, elevation.
- Always show units and define ambiguous terms such as elapsed versus moving duration.
- Use tabular numerals and consistent precision. Do not imply precision the source does not provide.
- Do not show missing values as zero. Use `Not available` or omit optional fields with a reason.
- Pair a metric with a short interpretation when it is important; raw numbers alone are not insight.
- Do not display a model version, record ID, or import counter with equal prominence to the runner's conclusion.

### Charts

- A chart must answer one named question, such as `How has weekly distance changed over the last 12 weeks?`.
- Label axes, units, dates/time period, timezone where dates matter, and comparison basis.
- Provide a text summary and accessible data table/list equivalent. Do not rely on color or visual position alone.
- Keep chart detail behind readiness or training detail. No default multi-chart dashboard on Home.
- Use restrained lines/bars with semantic colors. Avoid 3D, gradients, ornamental gauges, animation-heavy transitions, and unlabeled confidence bands.
- Show incomplete periods and missing data honestly. Do not interpolate or smooth absent training.
- On compact screens, use a readable simplified chart or the text/table view. Never require page-level horizontal scrolling.

## 11. Alert, warning, and error patterns

Use the smallest scope that contains the problem:

| Pattern | Use | Required content |
|---|---|---|
| Inline caveat | Material limitation of one claim | What is limited and how it affects interpretation. |
| Section status | Loading, pending, stale, or failure within one group | Affected content, current state, next action. |
| Form validation | Invalid/missing input | Field-specific correction. |
| Confirmation dialog | Approval, rejection, activation, or permitted schedule change | Target, consequence, required reason/acknowledgement, confirm/cancel. |
| Page-level alert | Authentication or a failure preventing the whole screen | What failed, safe recovery, preserved context. |

Rules:

- Warnings use amber; errors use red; both include text and a supported action or explicit no-action explanation.
- Do not create a global banner for a local activity-review error.
- Do not present a warning when data is simply unavailable without an actionable issue; use an unavailable explanation.
- Keep the current usable result visible when stale or refreshing. Label age and reason locally.
- A successful request that only queued work uses a queued status, not success language implying completion.
- Avoid raw API errors, stack traces, object keys, tokens, private paths, and arbitrary note content.

## 12. Loading skeleton rules

- Skeletons occupy the same approximate geometry as the content they replace so sections do not jump.
- Use a quiet surface contrast; do not animate a bright shimmer continuously. Respect reduced motion by removing shimmer.
- Skeletons require an accessible label such as `Loading recent training` and must not be the only information for an extended state.
- Keep loaded sections visible while another section refreshes. Do not cover the entire screen for a local detail request.
- After a user action, show the action's pending label and disable duplicate submission.
- Do not show a skeleton for an operation that is queued but not currently running; use `Queued`/`Waiting` text.
- Do not show a skeleton and an empty state simultaneously.

## 13. Empty-state patterns

An empty state explains the current condition and the next useful action. It does not fill space with marketing copy.

Required anatomy:

1. Plain-language heading stating what is absent.
2. One short explanation of why it matters.
3. One primary action when a useful action exists.
4. A quieter alternative or parent link when needed.

Patterns:

- No activities: `No training recorded yet` → explain CSV/GPX/Strava options → `Add training`.
- No goal: `No race goal set` → explain that outlook comparison needs a target → `Set up race goal`.
- No approved plan: `No approved plan` → explain that Today has no prescribed session → `Create a plan`.
- No review yet: show the measured activity first → `Coach's review not ready` → explain waiting/unavailable state.
- No linked plan: `No planned session is linked` → retain workout facts → offer supported plan selection only if available.
- No filtered results: state the filter context → `Clear filters`.
- No known data issues: use only after a successful check; never after a failed request.

Do not combine multiple unrelated empty states into a modal or four-card onboarding dashboard. Home replaces only the affected group and keeps the other groups usable.

## 14. Responsive layout rules

Shared breakpoints:

- Compact: below 768px.
- Medium: 768–1199px.
- Wide: 1200px and above.

Rules:

- Wide: left rail for Home/Training/Plan, separate Settings utility, content max-width 1280px, 24px gutters.
- Medium/compact: one labeled Home/Training/Plan navigation row and separate Settings utility. No duplicate primary menus or horizontal menu scrolling.
- Home remains one vertical reading sequence at every width. Do not convert the three groups into dense side-by-side cards on compact screens.
- Training uses list/detail columns only where both remain readable. Below 1200px, selected detail replaces the list and provides Back to training.
- Calendar uses four-week context when readable and Agenda below 1200px. Users must not pan horizontally to understand a week.
- Forms and comparison tables stack below 768px. Dialogs use available width, keep close controls visible, and avoid nested scroll traps.
- Preserve selected item, filters, form values, date context, and workflow stage when resizing.
- Keep essential content readable at 200% zoom and reflow at 320px without page-level horizontal scrolling.

## 15. Accessibility requirements

- Use semantic landmarks, one H1, logical heading levels, labeled navigation, and a skip link.
- Use native links/buttons and form controls. Do not make a `div` act like a button.
- Expose current navigation with `aria-current="page"` and selected controls with the appropriate native or ARIA state.
- Every control has an accessible name. Icon-only buttons require an accessible label and a visible tooltip is not sufficient.
- Focus is visible with at least a 3px outline/clear offset and is not hidden behind sticky headers or rails.
- Dialogs have an accessible name, initial focus, focus containment, Escape when cancellable, inert background, and focus return to the launcher.
- Associate labels, help, and errors with inputs. Use `aria-invalid` and `aria-describedby` where applicable.
- Announce meaningful loading, success, and failure transitions through appropriate live regions. Do not repeatedly announce unchanged polling.
- Text contrast is at least 4.5:1 for normal text and 3:1 for large text and essential control boundaries/focus indicators.
- Never use color as the only indication of active, stale, warning, error, review, or success state.
- Interactive targets are at least 44×44 CSS pixels. Keyboard operation must cover navigation, filters, disclosures, forms, list selection, dialogs, and Calendar actions.
- Respect reduced motion. Do not automatically move focus during background refresh or flash state changes.
- Charts have text summaries and equivalent data access. Tables remain understandable when CSS styling is removed.

## 16. Examples of correct usage

### Home outlook

```text
Race outlook
Half marathon · 26 October
Current fitness is trending toward your target based on the last 8 weeks of running.
Confidence is limited because two recent weeks have incomplete long-run data.
[View readiness]
```

This is correct because it names the target, evidence period, conclusion, and limitation without inventing a score.

### Recent training

```text
Recent training
Tuesday easy run · 10 September
You ran 48 minutes against the planned 45. The session is available for review; no effort data was recorded.
[View session]
```

This is correct because it separates recorded facts from what cannot be assessed and provides one relevant detail action.

### Import result

```text
Import result
Accepted 12 · Duplicates 3 · Rejected 1 · Warnings 2
One file could not be normalized. Correct the source and upload it again.
[Correct file]
```

This is correct because partial success is explicit and the next action addresses the actual problem.

### Pending review

```text
Coach's review
Waiting for review
Your activity is available now. Commentary will appear after the review is ready.
```

This is correct because the activity is usable and no completion time or invented progress is shown.

### Plan approval

```text
Approve this plan?
This will make Plan v3 the active plan used by Home and Calendar. It will not change any workout prescription after approval.
[Approve plan] [Cancel]
```

This is correct because the target and consequence are explicit and the primary action is singular.

## 17. Examples of what not to do

- Do not create five equal Home cards for readiness, confidence, recent training, next action, and data quality. These are questions answered through three groups and contextual detail.
- Do not display a large circular `82% readiness` gauge when the underlying model does not provide a calibrated score.
- Do not show a green `Completed` badge because an activity and planned session share a date.
- Do not turn a queued Strava backfill into `Import complete` before activities arrive.
- Do not show `No activities` while the activity request is still loading or after a read error.
- Do not hide the only primary navigation inside a hamburger on mobile.
- Do not render the Calendar seven-day grid at a width that requires horizontal panning to understand the week.
- Do not place every filter, source selector, sync state, model identifier, and history counter in the Home toolbar.
- Do not make an entire activity panel clickable when it contains independent buttons or disclosures.
- Do not use `#20c7f5` and `#ff6577` as arbitrary one-off colors in feature CSS; use semantic tokens.
- Do not use placeholders as form labels, red borders without explanatory text, or icon-only unlabeled controls.
- Do not use nested dialogs, auto-changing scroll positions, repeated polling announcements, or decorative animation.
- Do not rewrite an evidence-limited coach review into a stronger claim to fit a compact card.
- Do not introduce a new provider, embedded chat, automatic plan adaptation, athlete selector, role-management screen, or new visual language under the appearance of a design-system enhancement.

## Implementation handoff

Implement shared tokens and primitives first: application shell, navigation, panel anatomy, buttons, form fields, status/state components, summary blocks, detail surfaces, and responsive layout utilities. Then apply them to Home, Training, Plan, and secondary screens in that order.

Every component handoff should identify its semantic state API, keyboard behavior, responsive variant, loading/empty/error/success treatment, and data assumptions. If a visual request requires a value or capability that the current contracts do not provide, use the unavailable state and record the dependency. Do not solve a data gap with a decorative indicator or invented copy.
