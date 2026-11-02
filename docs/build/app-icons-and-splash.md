# App icons and splash screens

Every icon, splash image and favicon of the five apps is rendered from one set of vector masters in `scripts/brand-assets/art.mjs` and committed under `apps/omni/variants/<variant>/assets/`. Each app's icon is the Resgrid grid mark (a framed square with a column of blocks to its right and a row below) on the brand gradient `#2F93CE → #2757AB` with a long shadow, and the app's glyph inside the frame: Responder a person with a check, Unit a road with a turn sign, IC a clipboard checklist, Dispatch a console monitor, BigBoard a radio.

Never edit the PNGs by hand. Change the art, regenerate, review, commit.

```bash
pnpm --dir scripts/brand-assets install --ignore-workspace
node scripts/brand-assets/generate.mjs                    # all variants, into apps/omni/variants/*/assets
node scripts/brand-assets/generate.mjs unit --out /tmp/x  # preview one variant elsewhere
pnpm variants:check                                       # sizes and formats below
```

`scripts/brand-assets` is a standalone package (its own lockfile, not a workspace member) so the renderer, `@resvg/resvg-js`, stays out of the app's dependency graph. Output is deterministic.

## Files per variant

| File                           | Format                                                                   | Used for                                                                                          |
| ------------------------------ | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------- |
| `icon.png`                     | 1024×1024 RGB, full bleed, no rounding                                   | Expo `icon`, iOS light icon (`ios.icon.light`), Android 7 launcher icon. Badged in dev/staging.   |
| `ios-icon-dark.png`            | 1024×1024 RGBA, transparent background, no shadow                        | iOS 18+ dark appearance. Badged.                                                                  |
| `ios-icon-tinted.png`          | 1024×1024 RGB, greyscale on black                                        | iOS 18+ tinted appearance. Badged.                                                                |
| `adaptive-icon.png`            | 1024×1024 RGBA; mark inside the 66 dp safe circle of the 108 dp canvas   | Android adaptive foreground (with its long shadow). Badged with the adaptive overlays.            |
| `adaptive-icon-background.png` | 1024×1024 RGB gradient                                                   | Android adaptive background. `adaptiveIconBackground` stays as the colour resource.               |
| `adaptive-icon-monochrome.png` | 1024×1024 RGBA, white, coverage in alpha                                 | Android 13+ themed icons.                                                                         |
| `splash-icon.png`              | 1024×1024 RGBA, mark only                                                | iOS and Android splash (see below).                                                               |
| `splash-mark.svg`              | SVG, view box = the mark's box                                           | Web and Electron splash.                                                                          |
| `notification-icon.png`        | 96×96 RGBA, white silhouette                                             | Android small notification icon (24 dp at xxxhdpi; Android draws it white, so detail is cut out). |
| `favicon.png`                  | 512×512 RGBA rounded square                                              | Web `favicon.ico` (Expo generates it).                                                            |
| `desktop-icon.png`             | 1024×1024 RGBA, macOS grid: 824 pt rounded square, 100 pt margin, shadow | Electron macOS `.icns` and Linux packages; window/notification icon on Windows and Linux.         |
| `icon.ico`                     | 16–256 px (PNG at 256, 32-bit DIB below)                                 | Electron Windows executable, NSIS installer and uninstaller.                                      |

`pnpm variants:check` (CI) fails when a file is missing, has the wrong size, or when an opaque one has an alpha channel.

## Dev and staging badges

Non-store builds (`APP_ENV` development or staging) get an environment banner and a version ribbon on every icon the build shows: `icon`, all three iOS appearances and the Android adaptive foreground (`packages/config-plugins/plugins/with-icon-badge.js`, wrapping `app-icon-badge`). The overlays are 1024×1024 images composited at the origin without scaling, which is why every badged source must be exactly 1024×1024 — a smaller icon gets a misplaced, cropped badge. Adaptive overlays sit inside the safe zone, so they assume the 108 dp layout above. The background and monochrome layers are not badged. Store builds (`internal`, `production`) are never badged.

## Splash screens

| Platform               | How                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| iOS                    | `expo-splash-screen`: `splash-icon.png` at 200 pt on `splashBackground`; `splashBackgroundDark` in dark mode.                                                                                                                                                                                                                                                                                                                                                                                                                         |
| Android 12+            | Same plugin. The system draws the image on a 288 dp canvas and masks it to a 192 dp circle; at `imageWidth` 200 the mark (64% of the image) stays inside that circle, so nothing is clipped. Night resources carry the dark background.                                                                                                                                                                                                                                                                                               |
| Web (Docker), Electron | `apps/omni/public/index.html` is Expo's HTML template for every variant. Its splash sits inside `#root`, so it shows while the bundle loads and React replaces it on its first render — the same moment the native splash hides. `scripts/web-export.mjs` stamps the variant's `splash-mark.svg`, name and colours into the exported page (`stampWebSplash` in `@resgrid/config-plugins`); `expo start --web` shows the colours without the mark. Dark mode follows `prefers-color-scheme`; the progress bar respects reduced motion. |

Always export the web app with `pnpm web:export` (CI does). A bare `npx expo export` skips the stamping.

Colours come from the manifest (`identity.splashBackground`, `identity.splashBackgroundDark`), validated by the schema in `@resgrid/config`.

## Changing the artwork

- Glyphs, palettes (light, iOS dark, iOS tinted, Android monochrome) and the long shadow are in `art.mjs`; target sizes and compositions in `generate.mjs`. Mark geometry is in mark units (the mark box is 0..1000).
- Keep glyph parts that cross the frame line listed in the glyph's `halo`, so the line is cut around them.
- Check the Android safe circle (adaptive and splash) and the 24 dp notification silhouette after any change: render with `--out` and look at them on a circle mask and at 24 px.
- iOS 26 Icon Composer (`.icon`) files are not used: `app-icon-badge` cannot badge them.
