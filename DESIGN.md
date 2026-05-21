# Design

## Color Strategy

Restrained with a single committed accent. Tinted neutrals provide depth; one accent color marks interactive elements and focus states. A secondary warm tone reserved for the vocabulary/review module to create a subtle zone distinction.

## Palette

### Light Theme

```
--surface-base:      oklch(0.985 0.006 270);    /* faint lavender-tinted white */
--surface-raised:    oklch(0.975 0.008 270);    /* sidebar, cards */
--surface-sunken:    oklch(0.955 0.010 270);    /* input fields, code blocks */
--surface-overlay:   oklch(0.990 0.004 270);    /* dropdowns, popovers */

--text-primary:      oklch(0.205 0.012 270);    /* near-black, lavender-tinted */
--text-secondary:    oklch(0.445 0.010 270);    /* muted labels */
--text-tertiary:     oklch(0.595 0.008 270);    /* placeholders, hints */

--accent:            oklch(0.545 0.180 280);    /* deep violet — primary actions */
--accent-hover:      oklch(0.495 0.190 280);    /* hover state */
--accent-subtle:     oklch(0.925 0.040 280);    /* accent backgrounds */
--accent-text:       oklch(0.985 0.006 270);    /* text on accent */

--border:            oklch(0.905 0.010 270);    /* subtle borders */
--border-focus:      oklch(0.545 0.180 280);    /* focus ring = accent */

--success:           oklch(0.620 0.145 155);
--warning:           oklch(0.750 0.140 80);
--error:             oklch(0.580 0.200 25);
--info:              oklch(0.600 0.140 245);

--review-warm:       oklch(0.945 0.025 65);     /* vocab review zone tint */
```

### Dark Theme

```
--surface-base:      oklch(0.155 0.012 270);
--surface-raised:    oklch(0.185 0.014 270);
--surface-sunken:    oklch(0.125 0.010 270);
--surface-overlay:   oklch(0.205 0.014 270);

--text-primary:      oklch(0.935 0.008 270);
--text-secondary:    oklch(0.665 0.008 270);
--text-tertiary:     oklch(0.505 0.006 270);

--accent:            oklch(0.700 0.160 280);
--accent-hover:      oklch(0.750 0.165 280);
--accent-subtle:     oklch(0.245 0.045 280);
--accent-text:       oklch(0.155 0.012 270);

--border:            oklch(0.265 0.012 270);
--border-focus:      oklch(0.700 0.160 280);
```

## Typography

### Font Stack

```
--font-sans:  "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
--font-cjk:   "Noto Sans CJK SC", "Noto Sans CJK JP", "PingFang SC", "Hiragino Sans", "Microsoft YaHei", sans-serif;
--font-mono:  "JetBrains Mono", "Fira Code", ui-monospace, monospace;
```

Single family (Inter) for all UI text. CJK fallback chain for dictionary content. Mono reserved for phonetics and debug.

### Scale (ratio 1.2)

```
--text-xs:    0.694rem / 1.5;    /* 11px — badges, footnotes */
--text-sm:    0.833rem / 1.5;    /* 13px — captions, secondary labels */
--text-base:  1rem / 1.6;       /* 16px — body, inputs, list items */
--text-md:    1.2rem / 1.4;     /* 19px — section headings, dict names */
--text-lg:    1.44rem / 1.3;    /* 23px — page titles, headword display */
--text-xl:    1.728rem / 1.2;   /* 28px — hero headword in article view */
```

Weight: 400 body, 500 labels/buttons, 600 headings, 700 headwords.

## Spacing

8px grid. Key tokens:

```
--space-1:  4px;
--space-2:  8px;
--space-3:  12px;
--space-4:  16px;
--space-5:  20px;
--space-6:  24px;
--space-8:  32px;
--space-10: 40px;
--space-12: 48px;
--space-16: 64px;
```

## Radius

```
--radius-sm:  6px;     /* buttons, inputs, badges */
--radius-md:  10px;    /* cards, panels */
--radius-lg:  16px;    /* modals, large containers */
--radius-xl:  24px;    /* floating action surfaces */
--radius-full: 9999px; /* pills, avatars */
```

## Elevation

No box-shadows. Elevation through subtle background lightness shifts between surface layers. Overlays (dropdowns, modals) use a single thin border + background.

## Motion

### Curves

```
--ease-out-expo:  cubic-bezier(0.16, 1, 0.3, 1);
--ease-out-quart: cubic-bezier(0.25, 1, 0.5, 1);
--ease-in-out:    cubic-bezier(0.45, 0, 0.55, 1);
```

### Durations

```
--duration-fast:    120ms;   /* hover, focus ring */
--duration-normal:  200ms;   /* panel open, tab switch */
--duration-slow:    350ms;   /* page transitions, collapse */
--duration-slower:  500ms;   /* stagger reveals, large layout shifts */
```

### Principles

- Ease-out-expo for elements entering/appearing
- Ease-out-quart for hover/focus state changes
- No bounce, no elastic, no spring in product UI
- Stagger delay: 30ms between list items (max 10 items staggered)
- Collapse/expand: height animate via `grid-template-rows: 0fr → 1fr` (not height)

## Layout

### App Shell

```
Sidebar (240px, collapsible to 56px icon-only)
├── Logo + App Name
├── Search (global shortcut target)
├── Navigation
│   ├── Lookup
│   ├── Review
│   ├── Word Books
│   ├── History
│   └── Settings
└── Dict Group Switcher (bottom)

Main Content (flex: 1)
├── TopBar (breadcrumb + actions, 48px)
└── Content Area (scrollable)
```

### Sidebar

- 240px default width, collapses to 56px (icon-only mode)
- Collapse trigger: chevron button or keyboard shortcut
- Active nav item: accent background tint + accent text, left indicator (2px width, not a side stripe — it's a 2px line indicator flush with the item edge)
- Transition: width 350ms ease-out-expo

### Search Page Layout

```
┌─ Sidebar ─┬──────────── Main ─────────────────────┐
│            │  SearchBar (sticky top)                │
│            │  ┌─────────────────────────────────┐   │
│            │  │ 🔍 Search dictionaries...    ⌘K │   │
│            │  └─────────────────────────────────┘   │
│            │                                        │
│            │  ┌─ Split ──────────────────────────┐  │
│            │  │ CandidateList  │  ArticleView    │  │
│            │  │ (280px fixed)  │  (flex: 1)      │  │
│            │  │                │                  │  │
│            │  │  apple         │  ┌─ Oxford ───┐  │  │
│            │  │  application   │  │ article... │  │  │
│            │  │  appreciate    │  ├─ Longman ──┤  │  │
│            │  │  approach      │  │ article... │  │  │
│            │  │  ...           │  └────────────┘  │  │
│            │  └────────────────┴──────────────────┘  │
└────────────┴─────────────────────────────────────────┘
```

### Review Page Layout

```
Main Content
├── ReviewHeader (today's stats: new / review / remaining)
├── CardArea (centered, max-width 520px)
│   └── ReviewCard (front: headword → tap → back: definition)
└── ActionBar (Again / Hard / Good / Easy buttons)
```

## Components

### SearchBar

- Full-width, 44px height, radius-sm
- Left: search icon (16px, text-tertiary)
- Right: keyboard shortcut badge (⌘K)
- Focus: border-focus ring, surface-sunken background
- Text: text-base, weight 400

### CandidateList

- Vertical list, no separators (spacing-based separation)
- Each item: 36px height, padding 0 space-3
- Hover: surface-sunken background, 120ms
- Selected: accent-subtle background, accent text
- Keyboard nav: up/down arrows, enter to confirm

### DictSection (Article Container)

- Header: dict icon (20px) + dict name (text-md, weight 600) + collapse chevron
- Collapse/expand: grid-template-rows transition, 350ms ease-out-expo
- Content: rendered in sandboxed iframe, auto-height
- Separator between sections: 1px border, space-6 gap

### ReviewCard

- Max-width 520px, aspect-ratio close to 3:2
- Surface-raised background, radius-lg
- Front: headword centered, text-xl, weight 700
- Back: definition text, text-base, scrollable if long
- Flip: 3D rotateY(180deg), 400ms ease-out-expo, `perspective: 1200px`

### Buttons

- Primary: accent background, accent-text, radius-sm, 36px height
- Secondary: transparent, border, text-primary, radius-sm
- Ghost: transparent, no border, text-secondary
- All: weight 500, text-sm, padding space-2 space-4
- Hover: 120ms ease-out-quart
- Active: scale(0.97), 80ms

### Dict Group Switcher

- Bottom of sidebar, above settings
- Current group name + chevron
- Click: popover with group list, radio selection
- Transition: popover fade + translateY(-4px), 200ms ease-out-expo
