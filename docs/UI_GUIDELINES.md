# UI_GUIDELINES.md
**RacePredictor — Visual Design & Component Guidelines**

---

## Purpose

This document defines the **visual design and component implementation rules** for the RacePredictor UI.

It governs:

- visual style
- layout discipline
- component structure
- spacing and typography
- interaction behavior

This document **does not define page structure or product workflows**.

Those are defined in:

`docs/UI_UX_SPEC.md`

If conflicts occur:

**UI_UX_SPEC.md takes precedence.**

---

# Core Design Philosophy

RacePredictor is an **analytical tool**, not a marketing site.

The interface must prioritize:

- readability
- clarity
- efficient workflows
- accurate data interpretation

The UI should feel similar to:

- GitHub
- Linear
- Stripe dashboards
- modern developer tools

The interface should **fade into the background behind the data**.

---

# General UI Principles

## Function First

Visual elements must serve a purpose.

Avoid UI patterns added purely for aesthetics.

If an element does not improve:

- comprehension
- navigation
- interaction

it should not exist.

---

## Calm Interfaces

The UI should feel calm and structured.

Avoid:

- heavy gradients
- glassmorphism
- glowing elements
- exaggerated shadows
- decorative motion

Interfaces should feel stable and focused.

---

## Predictability

Users should always understand:

- where they are
- where to find data
- how to act

Layouts and components must behave consistently across pages.

---

# Layout Standards

## Application Layout

Standard dashboard layout:

```
------------------------------------------------
Sidebar | Header / Filters
        |---------------------------------------
        | Main Content Area
        |---------------------------------------
        | Data panels / tables / charts
------------------------------------------------
```

---

## Sidebar

Width:

`240–260px`

Style:

- solid background
- subtle border-right
- no floating shells
- no decorative gradients

Purpose:

- global navigation
- athlete selection
- feature access

---

## Top Toolbar

Height:

`48–56px`

Contains:

- page title
- filters
- date range selector
- status indicator

Avoid:

- decorative copy
- marketing-style headings
- hero sections

---

## Content Container

Max width:

`1200–1400px`

Padding:

`24–32px`

Content should be organized into:

- summary metrics
- visualizations
- data tables
- insights

---

# Component Guidelines

## Cards / Panels

Used to group related information.

Style:

- border-radius: **8–12px**
- border: **1px solid subtle color**
- background: surface color

Optional shadow:

`0 2px 8px rgba(0,0,0,0.08)`

Avoid:

- floating cards
- heavy shadows
- glass effects
- large radii

---

## Buttons

Buttons must communicate clear actions.

Allowed styles:

Primary — `solid fill`

Secondary — `outline / border`

Radius:

`8–10px max`

Avoid:

- pill shapes
- gradients
- glow effects

---

## Dashboard Implementation Audit (Current)

Scope reviewed:

- `apps/web/components/dashboard/dashboard-shell.tsx`
- `apps/web/components/dashboard/dashboard.css`
- `apps/web/app/dashboard/page.tsx`

| Guideline requirement | Current implementation status | Required change | Priority |
|---|---|---|---|
| **Global shell consistency**: Sidebar + top toolbar + content regions should follow the standard app shell with a dedicated toolbar row for title/filters/status. | Sidebar and main content split exist, but there is no distinct top toolbar region; page title/version are embedded in content header only. Content area also has no max-width container guard. | Introduce a dedicated toolbar strip (`48–56px`) above dashboard panels; keep sidebar as global nav; wrap body content in a constrained container (`max-width: 1200–1400px`, centered) to stabilize layout across large displays. | **P0 (High)** |
| **Card/panel consistency**: Panels should have consistent structure and support common panel affordances (header/action/body). | Base `.card` visual style is close to guideline ranges, but panel internals are inconsistent (some plain lists, one definition list, no shared panel header/action pattern). Grid strategy also couples chart card span behavior to layout class names. | Standardize panel anatomy (title row + optional action/status + content body), normalize spacing/typography across KPI and detail cards, and extract reusable panel component/class to reduce per-card divergence. | **P1 (High-Med)** |
| **State handling & interaction clarity**: Users should understand current state and available interactions at a glance. | Navigation links are static anchors with only one hardcoded `active`; no route-aware state. Dashboard page fetches data but exposes no loading, empty, or error states. Interactive affordances (filters/date/status) are absent in shell. | Add route-aware nav active state, explicit loading/error/empty states in `page.tsx` flow (or via boundary components), and basic toolbar interaction slots (filters/date/status) so state is visible and predictable. | **P1 (High-Med)** |

---

## Tables

Tables are a **primary UI element**.

Rules:

- left-aligned data
- consistent column spacing
- subtle hover states
- clear column labels

Avoid:

- excessive tag badges
- decorative icons
- unnecessary color usage

Tables should maximize **scanability**.

---

## Forms

Structure:

```
Label
Input
Helper text (optional)
```

Rules:

- labels above fields
- consistent spacing
- clear focus states

Avoid:

- floating labels
- animated inputs
- decorative controls

---

## Drawers / Detail Panels

Used for:

- activity details
- expanded metrics
- drill-down data

Behavior:

- slide-in from right
- maintain context with underlying table

Avoid full page navigation when a drawer works better.

---

## Charts

Charts must communicate **real insights**.

Appropriate uses:

- training load trends
- weekly mileage
- pace distribution
- prediction confidence bands

Requirements:

- axes labeled
- units visible
- time zone context displayed

Avoid charts used only for visual decoration.

---

# Typography

Recommended scale:

- Page Title: **24–28px**
- Section Title: **18–20px**
- Body Text: **14–16px**
- Small Text: **12–13px**

Guidelines:

- use a simple sans-serif font
- maintain consistent hierarchy
- avoid decorative typography

Do not mix multiple font families.

---

# Spacing System

Recommended scale:

```
4px
8px
12px
16px
24px
32px
```

Spacing should support:

- grouping
- readability
- consistent rhythm

Avoid arbitrary spacing values.

---

# Color System

If the project defines a palette, **always use it**.

Otherwise define a minimal palette:

```
Background
Surface
Primary
Secondary
Accent
Text
```

Color should communicate:

- interaction
- state
- hierarchy

Avoid decorative color usage.

---

# Interaction Standards

Animations must remain minimal.

Allowed transitions:

- `100–200ms ease`
- opacity changes
- color transitions

Avoid:

- bounce animations
- transform-heavy motion
- exaggerated hover effects

---

# Icons

Icon guidelines:

Size: **16–20px**

Style:

- simple
- monochrome or minimal color
- consistent stroke weight

Avoid decorative icon containers.

---

# Accessibility Requirements

The UI must support:

- keyboard navigation
- sufficient color contrast
- screen reader compatibility
- clear focus states

Data visualizations must not rely solely on color.

---

# UI States

Every component must support:

- Loading
- Empty
- Error
- Stale data indicators

---

# Responsive Behavior

RacePredictor is **desktop-first**.

Desktop:
- multi-column layouts
- full navigation

Tablet:
- collapsible sidebar
- reduced column density

Mobile baseline:
- stacked layout
- simplified charts
- key actions preserved

Complex editing workflows may remain desktop-only.

---

# Anti‑Patterns to Avoid

Avoid:

- glassmorphism panels
- heavy gradients
- oversized rounded corners
- decorative KPI cards with no meaning
- charts used purely as decoration
- dashboard hero sections
- excessive UI copy explaining the interface

---

# Implementation Rules (for Codex)

When generating UI:

1. Follow layout defined in **UI_UX_SPEC.md**
2. Follow visual constraints in this document
3. Prefer reusable components
4. Prioritize data readability
5. Maintain consistent spacing and typography
6. Avoid decorative UI patterns

---

# Design Test

Before introducing UI elements ask:

- Does this improve clarity?
- Does this improve usability?
- Does this help users interpret their training data?

If not, remove it.

---

# Summary

RacePredictor UI should feel like a **professional analytical tool**.

It should be:

- structured
- calm
- readable
- predictable

Good UI disappears behind the **quality of the insights and data**.
