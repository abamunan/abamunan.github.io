# Money Tracker Design System

This document is the visual source of truth for the Money Tracker interface.
The palette and component direction are copied from the current Money Tracker
theme in `apps/money/app.css`, so future screens should use these tokens rather
than inventing one-off colors.

## Product direction

Money Tracker should feel:

- Calm and trustworthy for daily money decisions.
- Premium without looking heavy.
- Fast to scan on a phone and spacious on desktop.
- Soft, layered, and tactile through glassmorphism.
- Consistent between the green-white day theme and the blue-black dark theme.

The visual language is **frosted glass + financial clarity**:

1. Keep the page background atmospheric with subtle radial glow.
2. Put content inside translucent cards with restrained borders.
3. Use one strong accent for actions and focus states.
4. Use semantic colors only for income, expense, warning, error, and info.
5. Preserve high contrast for amounts and primary actions.

## Theme palettes

### Day theme: Green / White

Use this theme as the default light direction. It should feel fresh, stable,
and natural rather than bright or sterile.

| Token | Value | Use |
| --- | --- | --- |
| `--bg` | `#F3F8F5` | Page base |
| `--paper` | `rgba(255, 255, 255, 0.75)` | Sheets and structural surfaces |
| `--ink` | `#07251A` | Primary text and high-value numbers |
| `--muted` | `#3D6253` | Supporting text |
| `--soft` | `#5C8274` | Labels, metadata, inactive navigation |
| `--line` | `rgba(16, 185, 129, 0.16)` | Dividers and subtle outlines |
| `--lagoon` | `#0D8255` | Primary action, focus, active navigation |
| `--lagoon-tint` | `rgba(13, 130, 85, 0.10)` | Selected backgrounds and soft emphasis |
| `--lagoon-glow` | `rgba(13, 130, 85, 0.35)` | Accent shadows and glow |
| `--marker` | `#10B981` | Action gradient partner and highlights |
| `--ok` | `#0D8255` | Income, success, synced state |
| `--err` | `#E11D48` | Expense, destructive action, validation error |
| `--warn` | `#D97706` | Pending, caution, local/offline notice |
| `--info` | `#0284C7` | Informational messaging |

Day background recipe:

```css
radial-gradient(circle at 10% 10%, rgba(16, 185, 129, 0.14), transparent 45%),
radial-gradient(circle at 90% 85%, rgba(5, 150, 105, 0.10), transparent 45%),
radial-gradient(circle at 50% 50%, rgba(255, 255, 255, 0.7), transparent 70%),
#F3F8F5
```

Day hero gradient:

```css
linear-gradient(135deg, #064E3B 0%, #047857 55%, #0D9488 100%)
```

### Dark theme: Blue / Black

Use this theme for a focused, cinematic finance workspace. It should be
deep and calm, not pure black.

| Token | Value | Use |
| --- | --- | --- |
| `--bg` | `#060913` | Page base |
| `--paper` | `rgba(13, 21, 40, 0.70)` | Sheets and structural surfaces |
| `--ink` | `#F8FAFC` | Primary text and high-value numbers |
| `--muted` | `#94A3B8` | Supporting text |
| `--soft` | `#64748B` | Labels, metadata, inactive navigation |
| `--line` | `rgba(56, 189, 248, 0.15)` | Dividers and subtle outlines |
| `--lagoon` | `#38BDF8` | Primary action, focus, active navigation |
| `--lagoon-tint` | `rgba(56, 189, 248, 0.12)` | Selected backgrounds and soft emphasis |
| `--lagoon-glow` | `rgba(56, 189, 248, 0.35)` | Accent shadows and glow |
| `--marker` | `#22D3EE` | Action gradient partner and highlights |
| `--ok` | `#34D399` | Income and success |
| `--err` | `#FB7185` | Expense and destructive action |
| `--warn` | `#FBBF24` | Pending and caution |
| `--info` | `#60A5FA` | Informational messaging |

Dark background recipe:

```css
radial-gradient(circle at 12% 15%, rgba(30, 58, 138, 0.32), transparent 45%),
radial-gradient(circle at 88% 82%, rgba(6, 182, 212, 0.18), transparent 45%),
radial-gradient(circle at 50% 30%, rgba(15, 23, 42, 0.55), transparent 70%),
#060913
```

Dark hero gradient:

```css
linear-gradient(135deg, #0B132B 0%, #111E3F 50%, #0A1C38 100%)
```

## Glass tokens

Glass surfaces must remain translucent so the background atmosphere can show
through. Do not use opaque white cards on top of the ambient glow.

### Day glass

```css
--glass-surface: rgba(255, 255, 255, 0.70);
--glass-card: rgba(255, 255, 255, 0.76);
--glass-card-hover: rgba(255, 255, 255, 0.90);
--glass-border: rgba(16, 185, 129, 0.18);
--glass-border-subtle: rgba(255, 255, 255, 0.85);
--glass-shadow: 0 14px 34px -8px rgba(10, 80, 50, 0.08),
  0 2px 8px rgba(10, 80, 50, 0.03);
--glass-shadow-hover: 0 20px 45px -10px rgba(10, 80, 50, 0.14),
  0 0 20px rgba(16, 185, 129, 0.12);
```

### Dark glass

```css
--glass-surface: rgba(11, 20, 39, 0.65);
--glass-card: rgba(14, 25, 49, 0.72);
--glass-card-hover: rgba(18, 32, 62, 0.86);
--glass-border: rgba(56, 189, 248, 0.16);
--glass-border-subtle: rgba(255, 255, 255, 0.08);
--glass-shadow: 0 20px 48px -10px rgba(0, 0, 0, 0.75),
  0 0 25px -5px rgba(56, 189, 248, 0.12);
--glass-shadow-hover: 0 24px 56px -8px rgba(0, 0, 0, 0.85),
  0 0 35px rgba(56, 189, 248, 0.22);
```

Shared glass behavior:

```css
backdrop-filter: blur(24px) saturate(160%);
-webkit-backdrop-filter: blur(24px) saturate(160%);
border: 1px solid var(--glass-border);
```

Use stronger saturation (`175%`) for dark surfaces when needed. Avoid blur on
large full-page regions because it can reduce performance on mobile.

## Typography

The current app loads these families:

- **Display:** Bricolage Grotesque, for page titles, hero amounts, and major
  headings.
- **Body:** Figtree, with Plus Jakarta Sans as a fallback, for controls,
  labels, descriptions, and navigation.
- **Numeric:** JetBrains Mono, for calculations, dates, and aligned money
  values.
- **Bangla fallback:** Hind Siliguri, whenever Bangla copy is introduced.

Guidance:

- Use `font-weight: 800` for hero amounts and primary page titles.
- Use `font-weight: 700` for labels, buttons, and section headings.
- Keep metadata at `0.72rem` to `0.82rem`.
- Use `letter-spacing: -0.01em` for body copy and `-0.03em` for large titles.
- Always use tabular or mono styling when comparing money values in a column.

## Color semantics

The meaning of a color must not change between themes:

- **Income:** `var(--ok)` and a positive `+` sign.
- **Expense:** `var(--err)` and a negative `−` sign.
- **Primary action:** `var(--lagoon)` to `var(--marker)` gradient.
- **Selected item:** `var(--lagoon-tint)` with `var(--lagoon)` text.
- **Offline or pending:** `var(--warn)` and `var(--warn-bg)`.
- **Destructive action:** `var(--err)`, never the primary accent.
- **Focus:** a visible `2px` `var(--lagoon)` outline with offset.

Do not use red for ordinary expense amounts as a warning; it is the established
expense semantic. Reserve warning styling for an actual risk or pending state.

## Component direction

### App shell

- Desktop (`min-width: 1100px`): fixed glass sidebar on the left, content
  viewport to its right.
- Tablet and mobile: single-column content with a bottom tab bar.
- The first meaningful content starts at `Overview`; avoid decorative empty
  header space.
- Ambient orbs sit behind the shell and never intercept pointer events.

### Navigation

- Inactive tabs use `var(--soft)`.
- Active tabs use `var(--tab-active-text)` and a tinted glass background.
- Desktop active tabs have a left accent rail.
- Mobile active tabs have a short top accent line.
- Navigation labels should be short, familiar, and paired with a simple icon.

### Cards

- Default radius: `24px`.
- Hero radius: `26px`.
- Default padding: approximately `22px 24px`.
- Use one-pixel glass borders and a restrained shadow.
- Hover elevation is allowed on desktop; avoid large movement on touch devices.
- Add a subtle top highlight line to premium cards.

### Buttons

- Minimum touch target: `44px`.
- Primary buttons use the lagoon-to-marker gradient and white text in both
  themes.
- Secondary buttons use translucent glass with a border.
- Destructive buttons use the error color and require clear wording.
- Icon-only buttons need an accessible label and a visible focus state.

### Amount and entry forms

- Amount is the first visual priority.
- Use a large mono/display amount input with a clear label and a visible
  calculation preview.
- Expense/income must be a two-option segmented control.
- Category and account selections use scrollable chips when there are many
  options.
- Save action stays visible/sticky inside long mobile sheets.
- Optional date and note fields belong in a secondary disclosure area.

### Feedback

- Success and sync use green.
- Local-only, pending, and offline states use amber.
- Errors use rose/red with a direct recovery message.
- Toasts must say what happened and, where possible, offer Undo.
- Never silently fall back from cloud sync to local-only without a status label.

## Responsive behavior

| Viewport | Navigation | Content | Calculator |
| --- | --- | --- | --- |
| `< 700px` | Bottom tab bar | Full-width stacked cards | Floating button/window |
| `700px–1099px` | Bottom tab bar | Single-column or compact grid | Floating button/window |
| `>= 1100px` | Left glass sidebar | Wide dashboard with deliberate whitespace | Sidebar button opens window |

Touch interactions should not depend on hover. Hover can add elevation or tint
on desktop, but the default state must remain clear and usable.

## Spacing and shape rules

- Base spacing unit: `4px`.
- Common gaps: `8px`, `12px`, `14px`, `18px`, `24px`.
- Use `14px–16px` radii for controls and `24px–28px` for cards/sheets.
- Keep at least `12px` between adjacent interactive controls.
- Keep safe-area padding on mobile bottom navigation and sticky actions.

## Accessibility and quality bar

- Maintain readable contrast in both themes, especially muted text on glass.
- Every icon-only control needs an `aria-label`.
- Use `aria-pressed` for selected chips, segmented controls, and theme toggles.
- Preserve keyboard focus and allow Escape to close sheets and dialogs.
- Respect `prefers-reduced-motion`; ambient orb animation must not be required
  to understand the interface.
- Do not communicate state with color alone: pair color with text, sign, icon,
  or label.

## Implementation source

The live tokens and existing component styling are maintained in:

- `apps/money/app.css`
- `apps/shared/ui.css`
- `apps/money/index.html`

When adding a new screen, first reuse the existing CSS variables and component
patterns. Only add a new token when the visual meaning cannot be represented by
an existing semantic token.
