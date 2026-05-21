# MemoWords — Frontend Design Specification

> Design register: **Product**. Personality: **Polished, Precise, Unhurried**.
> Color strategy: **Restrained** — tinted neutrals with a single deep-violet accent.
> References: Raycast (command-line precision), Arc (detail craft), Linear (clean task flow).

---

## 1. Design Philosophy

**Scene sentence**: A language student sits at a desk under warm lamplight, laptop open, spending 30–60 minutes in focused vocabulary study. The room is quiet. The tool is precise and fast; every interaction rewards attention.

This forces: **light theme default**, warm-tinted neutrals, no visual noise. Dark theme available but not primary.

### Color identity

The palette avoids every category reflex for dictionary apps (blue-white academic, green-nature learning, orange-gamification). Instead: **lavender-tinted neutrals** with a **deep violet** accent. The violet is not pastel; it's saturated enough to command attention at small sizes (buttons, indicators) but used sparingly. The surfaces breathe with faint lavender warmth — subtle enough that most users can't name the tint, but would notice if it were removed.

```
Surface:  oklch(0.985 0.006 270)   — barely-there lavender white
Accent:   oklch(0.545 0.180 280)   — deep violet, used ≤10% of surface
Text:     oklch(0.205 0.012 270)   — lavender-tinted near-black
```

No pure white. No pure black. Every neutral carries `chroma 0.006–0.012` at hue 270.

---

## 2. App Shell

### Structure

```
┌─────────────────────────────────────────────────────────────────┐
│ Sidebar (240px)              │  Main Content (flex: 1)          │
│                              │                                   │
│ ┌─ Logo ──────────────────┐  │  ┌─ TopBar (48px) ────────────┐  │
│ │ ◆ MemoWords             │  │  │ Breadcrumb    [actions]    │  │
│ └─────────────────────────┘  │  └────────────────────────────┘  │
│                              │                                   │
│ ┌─ Search Trigger ────────┐  │  ┌─ Content ──────────────────┐  │
│ │ 🔍 Search...       ⌘K  │  │  │                            │  │
│ └─────────────────────────┘  │  │  (page-specific content)   │  │
│                              │  │                            │  │
│ ── Navigation ────────────── │  │                            │  │
│   ▸ Lookup          active  │  │                            │  │
│   ▸ Review                   │  │                            │  │
│   ▸ Word Books               │  │                            │  │
│   ▸ History                  │  │                            │  │
│                              │  │                            │  │
│ ── spacer ────────────────── │  │                            │  │
│                              │  │                            │  │
│ ┌─ Dict Group ────────────┐  │  │                            │  │
│ │ 📚 English Pro     ▾    │  │  │                            │  │
│ └─────────────────────────┘  │  └────────────────────────────┘  │
│ ┌─ Settings ──────────────┐  │                                   │
│ │ ⚙ Settings              │  │                                   │
│ └─────────────────────────┘  │                                   │
└──────────────────────────────┴───────────────────────────────────┘
```

### Sidebar Details

| Property | Value |
| --- | --- |
| Width | 240px expanded, 56px collapsed (icon-only) |
| Background | `surface-raised` oklch(0.975 0.008 270) |
| Border right | 1px `border` oklch(0.905 0.010 270) |
| Collapse | Click chevron or `⌘\` hotkey |
| Collapse animation | width 350ms ease-out-expo, label opacity 200ms ease-out-quart (stagger: labels fade out 100ms before width shrinks) |
| Expand animation | width 350ms ease-out-expo, labels fade in after 150ms delay |

**Logo**: "◆ MemoWords" — the diamond is the accent color. Text is `text-md` weight 600. In collapsed mode: only the diamond, centered.

**Search trigger**: Not a real input. A styled button that opens a command palette overlay when clicked or `⌘K` pressed. 40px height, `surface-sunken` background, `text-tertiary` placeholder text, `radius-sm`.

**Navigation items**: 
- Height 36px, padding 0 12px
- Icon (18px, Lucide) + label (`text-sm`, weight 500)
- Default: `text-secondary`
- Hover: `surface-sunken` background, 120ms ease-out-quart
- Active: `accent-subtle` background, `accent` text, left edge 2px accent indicator (flush, not a stripe — a precise 2px × 24px line at the left edge of the item, vertically centered, `radius-full` ends)
- Active indicator enters: scaleY(0→1) from center, 200ms ease-out-expo

**Dict Group Switcher**: Bottom of sidebar, above settings.
- Current group: icon + name + chevron, 40px height
- Click opens a popover above the button
- Popover: `surface-overlay` background, 1px `border`, `radius-md`
- Radio-style list of groups, checked = accent dot
- Popover enter: opacity 0→1 + translateY(4px→0), 200ms ease-out-expo
- Popover exit: opacity 1→0, 120ms ease-out-quart

---

## 3. Command Palette (Search Overlay)

Triggered by `⌘K` or clicking the sidebar search trigger.

```
┌─────────────────────────────────────────────┐
│  🔍  Type to search dictionaries...         │  ← input
├─────────────────────────────────────────────┤
│  apple                          Oxford ×3   │  ← candidate
│  application                    Longman ×2  │
│  appreciate                     Oxford ×1   │
│  ▸ approach                     Collins ×1  │  ← keyboard selected
│  approximately                  Merriam ×1  │
├─────────────────────────────────────────────┤
│  ↑↓ Navigate   ↵ Open   esc Close          │  ← footer hints
└─────────────────────────────────────────────┘
```

| Property | Value |
| --- | --- |
| Width | 560px, centered horizontally |
| Top offset | 20% from viewport top |
| Background | `surface-overlay` |
| Border | 1px `border` |
| Radius | `radius-lg` (16px) |
| Backdrop | `oklch(0.205 0.012 270 / 0.4)` (tinted translucent) |
| Input height | 52px, `text-md`, weight 400 |

**Animation**:
- Backdrop: opacity 0→1, 200ms ease-out-quart
- Panel: opacity 0→1 + scale(0.98→1), 250ms ease-out-expo
- Close: panel opacity 1→0 + scale(1→0.98), 150ms; backdrop 150ms
- Candidate list items: no stagger on initial load (too fast to matter), but new results fade-slide in when query changes: opacity 0→1 + translateY(4px→0), 150ms ease-out-expo, 30ms stagger (max 8 items)

**Candidate item**:
- Height 40px, padding 0 16px
- Left: headword (`text-base`, weight 500)
- Right: source dict badge (`text-xs`, `text-tertiary`, `surface-sunken` background, `radius-full` pill)
- Hover: `surface-sunken` background, 100ms
- Keyboard selected: `accent-subtle` background, `accent` left indicator (same 2px line as nav)
- Click / Enter: navigates to Lookup page with the selected word

---

## 4. Lookup Page (查词页)

The primary screen. Split layout: candidate list + article view.

### Layout

```
┌─ TopBar ──────────────────────────────────────────────────────┐
│  Lookup                                        [🔍] [⭐]     │
└───────────────────────────────────────────────────────────────┘

┌─ SearchBar (sticky) ──────────────────────────────────────────┐
│  🔍  apple                                           [✕]     │
└───────────────────────────────────────────────────────────────┘

┌─ CandidateList (280px) ──┬─ ArticleView (flex: 1) ───────────┐
│                          │                                     │
│  ● apple        ←active  │  ┌─ DictTabBar (sticky) ─────────┐ │
│    applecart             │  │ [Oxford] [Longman] [Collins]   │ │
│    applejack             │  └────────────────────────────────┘ │
│    apple pie             │                                     │
│    apple sauce           │  ┌─ Oxford English Dict ──── [▾] ┐ │
│    applet                │  │                                │ │
│    ...                   │  │  apple  /ˈæp.əl/  🔊          │ │
│                          │  │                                │ │
│                          │  │  noun                          │ │
│                          │  │  1. the round fruit of a       │ │
│                          │  │     tree of the rose family... │ │
│                          │  │                                │ │
│                          │  └────────────────────────────────┘ │
│                          │                                     │
│                          │  ┌─ Longman Dict ──────── [▾]  ┐  │
│                          │  │  apple  /ˈæpəl/  🔊         │  │
│                          │  │                              │  │
│                          │  │  [countable]                 │  │
│                          │  │  a hard round fruit that...  │  │
│                          │  └──────────────────────────────┘  │
│                          │                                     │
└──────────────────────────┴─────────────────────────────────────┘
```

### SearchBar

| Property | Value |
| --- | --- |
| Position | Sticky top, z-10 |
| Height | 48px |
| Background | `surface-base` with bottom 1px `border` |
| Input | `text-md`, weight 400, full width |
| Icon | Search icon 18px, `text-tertiary` |
| Clear button | × icon, visible when input has value, `text-tertiary` |
| Debounce | 200ms after last keystroke |
| Focus | `border-focus` bottom border transitions from center outward, 250ms ease-out-expo |

### CandidateList (Left Panel)

| Property | Value |
| --- | --- |
| Width | 280px fixed |
| Background | `surface-base` |
| Border right | 1px `border` |
| Scroll | Independent vertical scroll, thin custom scrollbar (4px, `text-tertiary` at 0.3 opacity) |

**Candidate item**:
- Height 36px, padding 4px 16px
- Headword: `text-base`, weight 400
- Hover: `surface-sunken` background, 100ms
- Active (selected): `accent-subtle` background, `accent` text, weight 500
- Transition between active states: background 150ms ease-out-quart

**Keyboard navigation**: ↑/↓ moves selection, selection follows scroll (scroll-into-view with 4px margin).

**Loading state**: 5 skeleton items, shimmer animation (gradient sweep left→right, 1.5s infinite, ease-in-out).

**Empty state**: centered vertically —
```
"No matches found"
text-secondary, text-sm, weight 400
Below: "Try a different spelling" in text-tertiary
```

### ArticleView (Right Panel)

**DictTabBar**: Sticky below SearchBar. Horizontal scroll if many dicts.
- Each tab: dict name (`text-sm`, weight 500), 32px height, `radius-sm`
- Default: `text-secondary`, no background
- Active: `accent` text, `accent-subtle` background
- Click scrolls the ArticleView to the corresponding DictSection
- Active indicator: bottom 2px line, slides between tabs with `left` + `width` animation, 250ms ease-out-expo (shared layout animation)

**DictSection**:
- Gap between sections: `space-6` (24px)
- Header: 44px height, sticky below DictTabBar
  - Left: dict icon (20px, rounded) + dict name (`text-md`, weight 600)
  - Right: collapse chevron (18px, `text-tertiary`)
  - Chevron rotates 180° on collapse, 200ms ease-out-quart
  - Background: `surface-raised`
  - Bottom border: 1px `border`

- Content: dictionary HTML rendered in sandboxed iframe
  - Padding: 16px 20px
  - Font: inherits `font-sans` + `font-cjk` fallback
  - Max line width: 75ch for prose content
  - Images: max-width 100%, auto height
  - Audio button: inline 🔊 icon, `accent` color, hover scale(1.1) 100ms

- Collapse animation:
  ```css
  .dict-section-content {
    display: grid;
    grid-template-rows: 1fr;
    transition: grid-template-rows 350ms cubic-bezier(0.16, 1, 0.3, 1);
  }
  .dict-section-content.collapsed {
    grid-template-rows: 0fr;
  }
  .dict-section-content > .inner {
    overflow: hidden;
  }
  ```

**Favorite button**: Top-right of TopBar. Star icon.
- Default: outline star, `text-tertiary`
- Hover: filled star, `warning` color, scale(1.1), 120ms
- Active (favorited): filled star, `warning` color
- Click: filled scale 0→1.2→1 pop, 300ms ease-out-expo

**Article loading**: Each DictSection shows a skeleton state independently:
- 3 text-line skeletons (60%, 80%, 45% width), shimmer
- Dict header visible immediately
- Content fades in: opacity 0→1, 200ms ease-out-quart

---

## 5. Review Page (背单词页)

### Layout

```
┌─ TopBar ──────────────────────────────────────────────────────┐
│  Review                              Today: 12 new · 28 due  │
└───────────────────────────────────────────────────────────────┘

┌─ Progress ────────────────────────────────────────────────────┐
│  ████████████░░░░░░░░░░░░░░░░░  15 / 40                     │
└───────────────────────────────────────────────────────────────┘

              ┌──────────────────────────────┐
              │                              │
              │                              │
              │         apple                │   ← front face
              │         /ˈæp.əl/             │
              │                              │
              │                              │
              │      tap to reveal           │
              └──────────────────────────────┘

              ┌──────────────────────────────┐
              │  apple  /ˈæp.əl/  🔊         │
              │                              │
              │  noun                        │   ← back face
              │  1. 苹果                     │      (after flip)
              │  2. the round fruit of...    │
              │                              │
              │  ── from Oxford ──           │
              └──────────────────────────────┘

         ┌─────────────────────────────────────────┐
         │  [Again]  [Hard]  [Good]  [Easy]        │
         │   <1m      <6m     <10m    4d           │
         └─────────────────────────────────────────┘
```

### ReviewCard

| Property | Value |
| --- | --- |
| Width | 100%, max-width 520px |
| Aspect | ~3:2 (flexible based on content) |
| Min-height | 280px |
| Background | `surface-raised` |
| Border | 1px `border` |
| Radius | `radius-lg` (16px) |
| Padding | `space-8` (32px) |

**Front face**:
- Headword: `text-xl` (28px), weight 700, `text-primary`, centered
- Phonetic: `text-base`, weight 400, `text-secondary`, centered, below headword
- "tap to reveal": `text-sm`, `text-tertiary`, bottom of card, with subtle pulse animation (opacity 0.4→0.7, 2s infinite ease-in-out)
- Hover: card lifts subtly — translateY(-2px), 200ms ease-out-quart

**Flip animation**:
```css
.card-container {
  perspective: 1200px;
}
.card {
  transform-style: preserve-3d;
  transition: transform 450ms cubic-bezier(0.16, 1, 0.3, 1);
}
.card.flipped {
  transform: rotateY(180deg);
}
.card-front, .card-back {
  backface-visibility: hidden;
  position: absolute;
  inset: 0;
}
.card-back {
  transform: rotateY(180deg);
}
```

**Back face**:
- Headword + phonetic: top-left, `text-md`, weight 600
- Audio button: inline, accent color
- Definition: `text-base`, weight 400, scrollable if long
- Source dict: bottom, `text-xs`, `text-tertiary`, italic
- Zone tint: the card back has a faint `review-warm` oklch(0.945 0.025 65) background tint — distinguishes "study mode" from "lookup mode"

### Action Buttons

Four buttons in a horizontal row below the card.

| Button | Color | Label |
| --- | --- | --- |
| Again | `error` tinted background (oklch error at 0.12 alpha) | "Again" + interval |
| Hard | `warning` tinted background | "Hard" + interval |
| Good | `success` tinted background | "Good" + interval |
| Easy | `info` tinted background | "Easy" + interval |

- Height: 48px
- Radius: `radius-sm`
- Label: `text-sm`, weight 600, colored matching the tint
- Sub-label (interval): `text-xs`, weight 400, `text-tertiary`
- Hover: tint opacity increases 0.12→0.20, 120ms
- Click: scale(0.96→1), 150ms ease-out-quart

**After action**: card slides out to the left (translateX(-120%), opacity→0, 250ms ease-out-expo), next card slides in from right (translateX(40px)→0, opacity 0→1, 300ms ease-out-expo, 100ms delay after exit completes).

### Progress Bar

- Height: 4px, `radius-full`
- Track: `surface-sunken`
- Fill: `accent`
- Fill transition: width 350ms ease-out-expo (smooth growth on each card completion)
- Stats text right-aligned: `text-sm`, `text-secondary`

### Session Complete State

When all cards are done:

```
              ┌──────────────────────────────┐
              │                              │
              │       Session Complete       │
              │                              │
              │       40 words reviewed      │
              │       92% correct            │
              │                              │
              │       [Review Again]         │
              │       [Back to Word Books]   │
              └──────────────────────────────┘
```

- Entrance: scale(0.95→1) + opacity(0→1), 400ms ease-out-expo
- Stats numbers: count up from 0, 600ms, staggered 100ms

---

## 6. Word Books Page (词库页)

### Layout

```
┌─ TopBar ──────────────────────────────────────────────────────┐
│  Word Books                                   [+ New Book]    │
└───────────────────────────────────────────────────────────────┘

┌─ Tabs ────────────────────────────────────────────────────────┐
│  [Built-in]  [Custom]  [Favorites]                           │
└───────────────────────────────────────────────────────────────┘

┌─ Book List ───────────────────────────────────────────────────┐
│                                                               │
│  ┌─ CET-4 ──────────────────────────────────────────────────┐ │
│  │  CET-4 Core Vocabulary                    4,500 words    │ │
│  │  ████████████████░░░░░░░░░░  68% mastered                │ │
│  │  English · Built-in                       [Start Review] │ │
│  └──────────────────────────────────────────────────────────┘ │
│                                                               │
│  ┌─ CET-6 ──────────────────────────────────────────────────┐ │
│  │  CET-6 Core Vocabulary                    5,500 words    │ │
│  │  ████░░░░░░░░░░░░░░░░░░░░░  12% mastered                │ │
│  │  English · Built-in                       [Start Review] │ │
│  └──────────────────────────────────────────────────────────┘ │
│                                                               │
│  ┌─ JLPT N1 ────────────────────────────────────────────────┐ │
│  │  JLPT N1 Vocabulary                      10,000 words   │ │
│  │  ░░░░░░░░░░░░░░░░░░░░░░░░░  0% mastered                 │ │
│  │  Japanese · Built-in                      [Start Review] │ │
│  └──────────────────────────────────────────────────────────┘ │
│                                                               │
└───────────────────────────────────────────────────────────────┘
```

### Book List Item

**Not cards.** These are horizontal rows with a 1px bottom border. No elevated surface, no shadow, no rounded container. Content-density over decoration.

| Property | Value |
| --- | --- |
| Padding | `space-4` (16px) vertical, `space-5` (20px) horizontal |
| Border-bottom | 1px `border` |
| Hover | `surface-sunken` background, 120ms |

- Row 1: Book name (`text-md`, weight 600) + word count right-aligned (`text-sm`, `text-secondary`)
- Row 2: Mini progress bar (3px height, `radius-full`, `accent` fill) + percentage (`text-sm`, `text-secondary`)
- Row 3: Language badge (`text-xs`, pill, `surface-sunken`) + source badge + "Start Review" ghost button right-aligned

### Tab Bar

- Horizontal tabs, bottom-aligned indicator
- Active tab: `accent` text, 2px bottom line (slides between tabs, 250ms ease-out-expo)
- Inactive: `text-secondary`
- Tab switch content: crossfade 200ms ease-out-quart

### Empty State (Custom tab, no books)

```
            No custom word books yet

     Create a word book to collect words
     you encounter while looking things up.

            [+ Create Word Book]
```

- Text: `text-secondary`, centered
- Button: primary (accent), centered
- Container: vertically centered in content area, max-width 360px
- Entrance: opacity 0→1, 400ms ease-out-quart (no translation — it just appears calmly)

---

## 7. History Page (历史页)

### Layout

```
┌─ TopBar ──────────────────────────────────────────────────────┐
│  History                                     [Clear All]      │
└───────────────────────────────────────────────────────────────┘

┌─ History List ────────────────────────────────────────────────┐
│                                                               │
│  Today                                                        │
│  ─────────────────────────────────────────                    │
│  apple              Oxford, Longman            2 min ago      │
│  application        Oxford                     15 min ago     │
│  dictionary         Collins, Oxford            1 hr ago       │
│                                                               │
│  Yesterday                                                    │
│  ─────────────────────────────────────────                    │
│  perspective         Longman                   Yesterday      │
│  comprehensive       Oxford                    Yesterday      │
│                                                               │
└───────────────────────────────────────────────────────────────┘
```

- Date groups: `text-sm`, weight 600, `text-secondary`, uppercase, with `space-6` gap above
- History item: 40px height, word left (`text-base`, weight 400), dict names center (`text-sm`, `text-tertiary`), time right (`text-xs`, `text-tertiary`)
- Hover: `surface-sunken`, 100ms
- Click: navigates to Lookup with that word
- Swipe-to-delete (or hover delete button): item slides right + fades, 200ms ease-out-expo, below items slide up 200ms ease-out-expo with 50ms delay
- Clear All: confirmation popover (not modal), "Clear all history?" + [Cancel] [Clear]

---

## 8. Settings Page (设置页)

### Layout

```
┌─ TopBar ──────────────────────────────────────────────────────┐
│  Settings                                                     │
└───────────────────────────────────────────────────────────────┘

┌─ Settings List ───────────────────────────────────────────────┐
│                                                               │
│  Appearance                                                   │
│  ─────────────────────────────────────────                    │
│  Theme                                  [Light ▾]             │
│  Dictionary font size                   [16px  ▾]             │
│                                                               │
│  Dictionaries                                                 │
│  ─────────────────────────────────────────                    │
│  Dictionary folders                     [Manage →]            │
│  Scan for new dictionaries              [Scan]                │
│  Index rebuild                          [Rebuild]             │
│                                                               │
│  Review                                                       │
│  ─────────────────────────────────────────                    │
│  Algorithm                              [SM-2  ▾]             │
│  New cards per day                      [20    ]              │
│  Review cards per day                   [100   ]              │
│                                                               │
│  About                                                        │
│  ─────────────────────────────────────────                    │
│  Version                                0.1.0                 │
│  Source                                 [GitHub →]            │
│                                                               │
└───────────────────────────────────────────────────────────────┘
```

- Section headers: `text-sm`, weight 600, `text-secondary`, uppercase tracking-wide
- Setting rows: 48px height, label left (`text-base`, weight 400), control right
- Dividers: 1px `border` between sections
- Controls: dropdown / input / button, all `radius-sm`, consistent 32px height
- Max content width: 640px, centered

---

## 9. Dictionary Management (词典管理)

Accessed from Settings → "Manage" or dedicated page.

### Import Flow

1. Click "Add Dictionary Folder" → native folder picker (Tauri dialog)
2. Scanning indicator: inline progress — "Scanning... 12 files found" with a subtle spinner (rotating accent-colored circle, 16px, 800ms linear infinite)
3. Results: list of discovered MDX files with checkboxes
4. Click "Import Selected" → indexing begins
5. Indexing: each dict shows inline progress bar (3px, accent, animated width)
6. Complete: checkmark fade-in replaces progress bar, 200ms

### Dict Group Editor

```
┌─ Groups ──────────────────────────────────────────────────────┐
│                                                               │
│  English Pro                                      [Edit]      │
│  ┌──────────────────────────────────────────────────────────┐ │
│  │  ≡  Oxford Advanced Learner's            [on]           │ │
│  │  ≡  Longman Dictionary                   [on]           │ │
│  │  ≡  Collins COBUILD                      [off]          │ │
│  │  ≡  Merriam-Webster                      [on]           │ │
│  └──────────────────────────────────────────────────────────┘ │
│                                                               │
│  Japanese                                         [Edit]      │
│  ┌──────────────────────────────────────────────────────────┐ │
│  │  ≡  大辞林                                [on]           │ │
│  │  ≡  新明解国語辞典                        [on]           │ │
│  └──────────────────────────────────────────────────────────┘ │
│                                                               │
│                                      [+ New Group]           │
└───────────────────────────────────────────────────────────────┘
```

- `≡` drag handle: `text-tertiary`, cursor grab
- Drag-and-drop: @dnd-kit, dragged item gets `surface-overlay` background + subtle `border-focus` outline + translateY shift, drop target shows 2px accent insertion line
- Toggle switch: 36px wide, 20px tall, `radius-full`
  - Off: `surface-sunken` track, `text-tertiary` knob
  - On: `accent` track, white knob
  - Transition: 200ms ease-out-quart, knob slides + track color shifts

---

## 10. Motion Choreography Summary

### Hierarchy of Motion

| Layer | Purpose | Duration | Easing |
| --- | --- | --- | --- |
| **Feedback** | Hover, focus, press | 80–150ms | ease-out-quart |
| **State** | Toggle, select, expand | 200–250ms | ease-out-quart |
| **Transition** | Page change, panel open | 300–400ms | ease-out-expo |
| **Reveal** | Card flip, new content | 400–500ms | ease-out-expo |

### Specific Animations

| Element | Trigger | Animation | Duration | Easing |
| --- | --- | --- | --- | --- |
| Nav item hover | mouseenter | bg color | 120ms | ease-out-quart |
| Nav active indicator | route change | scaleY(0→1) | 200ms | ease-out-expo |
| Sidebar collapse | toggle | width + label opacity | 350ms | ease-out-expo |
| Command palette open | ⌘K | scale(0.98→1) + opacity | 250ms | ease-out-expo |
| Command palette close | esc | scale(1→0.98) + opacity | 150ms | ease-out-quart |
| Search results | query change | translateY(4px→0) + opacity, stagger 30ms | 150ms | ease-out-expo |
| DictSection collapse | chevron click | grid-template-rows 1fr→0fr | 350ms | ease-out-expo |
| DictTabBar indicator | tab click | left + width | 250ms | ease-out-expo |
| Review card flip | tap/click | rotateY(0→180deg) | 450ms | ease-out-expo |
| Review card exit | action button | translateX(0→-120%) + opacity | 250ms | ease-out-expo |
| Review card enter | after exit | translateX(40px→0) + opacity | 300ms | ease-out-expo |
| Button press | mousedown | scale(1→0.97) | 80ms | ease-out-quart |
| Button release | mouseup | scale(0.97→1) | 150ms | ease-out-quart |
| Favorite star | click | scale(0→1.2→1) | 300ms | ease-out-expo |
| Progress bar fill | card complete | width | 350ms | ease-out-expo |
| Popover open | click | translateY(4px→0) + opacity | 200ms | ease-out-expo |
| Popover close | blur/esc | opacity(1→0) | 120ms | ease-out-quart |
| Page transition | route change | crossfade opacity | 200ms | ease-out-quart |
| Skeleton shimmer | loading | gradient sweep | 1500ms | ease-in-out, infinite |
| List item delete | swipe/delete | translateX(0→100%) + opacity | 200ms | ease-out-expo |

### `prefers-reduced-motion` Override

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}
```

All motion removed. State changes are instant but still visible (colors, backgrounds still change, just without transition).

---

## 11. Component Token Map

Quick reference mapping components to design tokens:

| Component | Background | Text | Border | Radius |
| --- | --- | --- | --- | --- |
| App surface | `surface-base` | `text-primary` | — | — |
| Sidebar | `surface-raised` | — | right 1px `border` | — |
| SearchBar | `surface-base` | `text-primary` | bottom 1px `border` | — |
| Input field | `surface-sunken` | `text-primary` | 1px `border` | `radius-sm` |
| Primary button | `accent` | `accent-text` | — | `radius-sm` |
| Ghost button | transparent | `text-secondary` | — | `radius-sm` |
| Candidate item | transparent | `text-primary` | — | — |
| Candidate hover | `surface-sunken` | — | — | — |
| Candidate active | `accent-subtle` | `accent` | — | — |
| DictSection header | `surface-raised` | `text-primary` | bottom 1px | — |
| ReviewCard | `surface-raised` | `text-primary` | 1px `border` | `radius-lg` |
| ReviewCard back | `review-warm` | `text-primary` | 1px `border` | `radius-lg` |
| Tab active | `accent-subtle` | `accent` | — | `radius-sm` |
| Toggle on | `accent` | white | — | `radius-full` |
| Toggle off | `surface-sunken` | `text-tertiary` | — | `radius-full` |
| Badge / Pill | `surface-sunken` | `text-secondary` | — | `radius-full` |
| Popover | `surface-overlay` | `text-primary` | 1px `border` | `radius-md` |
| Skeleton | `surface-sunken` | — | — | `radius-sm` |

---

## 12. Responsive Behavior

MemoWords is a desktop Tauri app, but window sizes vary.

| Breakpoint | Behavior |
| --- | --- |
| ≥ 1200px | Full layout: sidebar expanded + candidate list + article view |
| 900–1199px | Sidebar collapsed to icon-only (56px), candidate + article |
| < 900px | Sidebar collapsed, candidate list hidden (search via command palette only), article full-width |

All transitions use the standard 350ms ease-out-expo. No layout shifts — panels collapse/expand, never reflow.

---

## 13. Dark Theme Application

All surface/text/border tokens swap. Accent shifts lighter to maintain contrast:

| Token | Light | Dark |
| --- | --- | --- |
| `surface-base` | oklch(0.985 0.006 270) | oklch(0.155 0.012 270) |
| `surface-raised` | oklch(0.975 0.008 270) | oklch(0.185 0.014 270) |
| `text-primary` | oklch(0.205 0.012 270) | oklch(0.935 0.008 270) |
| `accent` | oklch(0.545 0.180 280) | oklch(0.700 0.160 280) |
| `border` | oklch(0.905 0.010 270) | oklch(0.265 0.012 270) |

Theme switch: all token values transition via CSS `transition: background-color 300ms, color 300ms, border-color 300ms`. One smooth sweep, no flash.

Dictionary article content inside iframes uses a separate dark-mode strategy (CSS filter inversion or DarkReader-style processing, configurable per dict).
