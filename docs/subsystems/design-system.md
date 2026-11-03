# Design system

Owner decision 21 (plan §15, §7.9): all five apps use one design system, taken from the Dispatch app. There is no per-variant accent or theme file; an app differs only in what its screens show (its home and signature modules), never in how a shared surface looks.

## Tokens

`apps/omni/theme-tokens.css` (light `:root`, dark media query) and `theme-tokens.web.css` (the web `.dark` / `.light` classes) hold the colour ramps; `packages/ui/src/theme/tokens.ts` mirrors them for code that cannot use class names. The parity test in `packages/ui/src/theme/__tests__/theme.test.tsx` fails when the three drift, and checks that every dark ramp is the light one reversed.

| Token scale                                       | Palette                                    | Light / dark use                                                                                                                                                  |
| ------------------------------------------------- | ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `background`                                      | Tailwind gray                              | `-0` screens and panels (white / gray-900), `-50` raised rows, cards, panel and app-bar headers (gray-50 / gray-800), `-100` pressed surfaces and inputs          |
| `background-canvas`                               | Tailwind gray                              | The page behind panels and the app sidebar (gray-100 / gray-950)                                                                                                  |
| `outline`                                         | Tailwind gray                              | `-100` dividers inside lists, `-200` card and panel borders (gray-200 / gray-700), `-300` input borders                                                           |
| `typography`                                      | Tailwind gray                              | `-800` titles, `-900` body, `-600` labels, `-500` secondary text (gray-500 / gray-400), `-400` hints and times, `-0` text on a filled primary or semantic surface |
| `primary`                                         | Tailwind indigo                            | Selection, counts, active tabs and toggles, links, buttons (Dispatch's console accent)                                                                            |
| `secondary`                                       | Tailwind gray                              | Secondary buttons                                                                                                                                                 |
| `error`, `success`, `warning`, `info`, `tertiary` | gluestack (unchanged from the legacy apps) | Semantic states                                                                                                                                                   |

## Rules

- Use token classes (`bg-background-0`, `text-typography-500`, `border-outline-200`), not `isDark ? '#hex' : '#hex'`. Where a class cannot reach (icons, maps, SVG, navigation themes), use `useThemeColors()` (`colors.text`, `colors.textMuted`, `colors.token('typography-500')`, `colors.canvas`).
- A filled primary or semantic surface (`bg-primary-600`, `bg-success-600`) takes `text-typography-0` and icons in `colors.textInverse`, never hardcoded white: in dark mode those fills are the light end of the reversed ramp.
- Department and server colours (status, staffing, priority, note colours) drawn as text, dots or borders go through `useReadableColor()` (`text()` for 4.5:1, `mark()` for 3:1); content drawn on such a colour uses `contentOnFill()`.
- Categorical colours that mean the same in both modes (stats tiles, PTT state, call priority fills, type chips) are fixed hex or Tailwind palette classes with a `dark:` pair, as Dispatch draws them.
- A `Pressable` that is not interactive is drawn at 40% opacity; render a `View` for a tile or row that has no action.

## Dispatch's surfaces

- **App bar** (`@resgrid/app-shell` `ShellHeader`): `background-50` with body text, a hairline and a soft shadow; screen actions on the right (the Dispatch console puts "Available only" / "Single list" there, icon-only on phones).
- **Sidebar:** the canvas, with the active entry washed in primary.
- **Panels** (`PanelFrame` in the console): `background-0` with an `outline-200` border; header on `background-50` with the panel's colour icon, a `typography-800` title and an indigo count pill.
- **Rows** (units, personnel, notes): `background-50` cards with an `outline-200` border, indigo when selected; status as a dot and its name in the readable department colour.
