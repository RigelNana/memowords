# Product

## Register

product

## Users

Language learners preparing for standardized exams (CET-4/6, TEM-8, IELTS, TOEFL, GRE, JLPT N1/N2). Dictionary enthusiasts who collect and curate MDX dictionaries. Readers who want multi-dictionary lookups with rich HTML rendering. They work at desks, focused, often in long study sessions. They expect the tool to be fast, precise, and invisible: it should disappear into the task of learning.

## Product Purpose

MemoWords is a high-performance local dictionary and vocabulary memorization desktop client. It parses MDX/MDD dictionary files, builds indexes for instant lookup, and renders rich dictionary articles with full CSS/image/audio support. It combines this with spaced-repetition vocabulary learning (SM-2/FSRS). Success: a single app that replaces both GoldenDict and Anki for language learners, with sub-10ms search and a polished, modern interface.

## Brand Personality

Polished. Precise. Unhurried.

The tool feels like a well-made instrument: every surface considered, every interaction deliberate, no wasted space. It conveys expert confidence without being cold. There's warmth in the details (smooth transitions, thoughtful empty states), but never frivolity.

## Anti-references

- **GoldenDict / Lingoes / StarDict**: legacy desktop-app aesthetic. Dense grey toolbars, cramped layouts, dated iconography. MemoWords must feel contemporary.
- **Duolingo / gamified apps**: cartoon mascots, achievement badges, bright primaries, infantile tone. MemoWords is for focused study, not gamification.
- **Generic SaaS dashboards**: hero-metric cards, identical blue accents, stock illustration empty states. MemoWords has its own identity.
- **Electron bloat**: sluggish apps that look like wrapped websites. MemoWords is native-grade (Tauri), and must feel it.

## Design Principles

1. **Content is king**: dictionary articles are the product's core output. Every layout decision serves readability and scanability of rich HTML content.
2. **Speed is a feature**: perceived performance matters as much as real performance. Instant search feedback, skeleton states, no layout shifts.
3. **Expert confidence**: UI for people who know what they're doing. No hand-holding, no tooltips on obvious actions. Dense when the task demands density.
4. **Quiet precision**: details that reward attention. Transitions that feel physical, spacing that breathes, typography that serves the text.
5. **One vocabulary**: consistent component language across every screen. The search bar, the card, the button: each has one shape, one voice.

## Accessibility & Inclusion

Motion-rich experience by default. Respect `prefers-reduced-motion` for users who need it. Color contrast should meet WCAG AA as a baseline. Keyboard navigation for core flows (search, review cards). CJK typography considerations: proper line height and font fallbacks for Chinese/Japanese content in dictionary articles.
