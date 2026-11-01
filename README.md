<div align='center'>

<h1>Resgrid Omni</h1>
<p>One codebase for every Resgrid client app — Responder, Unit, IC, Dispatch and BigBoard — each built for iOS, Android, Web and Desktop (Windows, macOS, Linux), each with an experience tailored to the people who use it.</p>

<h4> <a href="https://resgrid.com">Resgrid</a> <span> · </span> <a href="docs/architecture/omni-plan.md"> Plan </a> <span> · </span> <a href="https://github.com/Resgrid/Omni/issues"> Report Bug </a> <span> · </span> <a href="https://github.com/Resgrid/Omni/issues"> Request Feature </a> </h4>

</div>

> [!IMPORTANT]
> **Status: planning (2026-10-31).** Omni is being built from the five existing app repositories. Until an app's Omni build replaces its store listing, that app keeps shipping from its own repo ([Responder](https://github.com/Resgrid/Responder), [Unit](https://github.com/Resgrid/Unit), [IC](https://github.com/Resgrid/IC), [Dispatch](https://github.com/Resgrid/Dispatch), [BigBoard](https://github.com/Resgrid/BigBoard)). The commands and paths below describe the target layout from the [consolidation plan](docs/architecture/omni-plan.md).

# :notebook_with_decorative_cover: Table of Contents

- [About the Project](#star2-about-the-project)
- [The Apps](#iphone-the-apps)
- [Features](#dart-features)
- [How It Works](#jigsaw-how-it-works)
- [Deployment Options](#package-deployment-options)
- [Getting Started](#toolbox-getting-started)
- [Releases and Versioning](#rocket-releases-and-versioning)
- [Contributing](#handshake-contributing)
- [Roadmap](#compass-roadmap)
- [FAQ](#grey_question-faq)
- [License](#warning-license)

## :star2: About the Project

[Resgrid](https://resgrid.com) is an open-source dispatch, communications, personnel and incident management platform for first responders, emergency management and other organizations that respond to events. Its client apps all talk to [Resgrid Core](https://github.com/Resgrid/Core) through the same API, realtime hubs and push notifications.

Those apps started as one Expo / React Native scaffold that was forked for each audience. Over time the shared code drifted: the same fix was applied five times, and features reached some apps but not others. **Omni brings them back together.** One Expo project, one set of dependencies and native config, one upgrade path for Expo and React Native — producing five separate apps with their own store listings, icons and user experience.

## :iphone: The Apps

| App | For | Form factor | Highlights |
|---|---|---|---|
| **Responder** | Department members | Phone | Personal status and staffing, calls, messages and chat, shifts and trades, calendar, checklists, work orders, certifications, sign-in approvals |
| **Unit** | Apparatus, vehicle and team crews | Vehicle tablet / laptop (MDT) | Unit status console, crew roles, automatic vehicle location, push-to-talk, routes and stops, inventory counts, in-app navigation (planned) |
| **IC** | Incident commanders | Tablet (landscape) and desktop | Digital command board, ICS structure and lanes, resource tracking, accountability/PAR, objectives, timers, command maps |
| **Dispatch** | Dispatchers | Desktop and web | Multi-panel dispatch console, new/pending/scheduled/archived calls, run cards, unit and personnel actions, weather alert management |
| **BigBoard** | Stations and EOCs | Wall display / TV | Configurable widget dashboard: calls, units with status timers, personnel, map, weather and alerts |

Every app ships on **iOS, Android, Web (Docker image) and Desktop (Electron: Windows, macOS, Linux)**.

## :dart: Features

Shared by all five apps, implemented once:

- **Offline-first** — the shift's working data is stored on the device; actions taken without a connection are queued, survive restarts and replay exactly once when the connection returns. Pending and stuck items are visible in Settings.
- **Offline maps** — MapLibre maps everywhere, with downloadable base maps (Protomaps) and department map data (custom and indoor maps, layers, geofences, POIs, hydrants, pins) for the department's response area.
- **Realtime** — live updates over SignalR for calls, statuses, units, personnel locations, incident command, chat and weather alerts.
- **Notifications** — push on mobile, web and desktop, with critical alerts for dispatches and a notification inbox.
- **Voice** — push-to-talk over LiveKit, Bluetooth and headset PTT buttons where the app needs them.
- **Security** — MFA, passkeys and single sign-on (OIDC/SAML), shared-device sessions for vehicles and consoles, protected data handling.
- **Department-aware** — feature flags, department terminology (rename calls, units, record types…), custom statuses and permissions honoured everywhere.
- **Ten languages** — English, Arabic, German, Greek, Spanish, French, Italian, Polish, Swedish and Ukrainian.
- **Over-the-air updates** — JavaScript fixes ship without waiting for a store review.

## :jigsaw: How It Works

```
apps/
  omni/                 the one Expo project (iOS, Android, Web)
    variants/
      responder/        variant.ts (identity + capabilities) · app/ (routes) · assets/ · theme.css
      unit/  ic/  dispatch/  bigboard/
  desktop/              Electron shell that packages each app's web build
packages/               shared code, published as @resgrid/* workspace packages
  config  core  models  api  offline  auth  data  realtime  notifications
  location  voice  maps  navigation  i18n  ui  app-shell  features  config-plugins
tooling/                ESLint, TypeScript and Jest presets
docs/                   architecture, build and subsystem documentation
```

- **One project, five variants.** `APP_VARIANT=responder|unit|ic|dispatch|bigboard` selects which app is built. Each variant's manifest (`variants/<app>/variant.ts`) holds everything that makes the app itself: bundle ids, schemes, icons, which native modules and permissions it needs, its navigation shell and its capabilities.
- **Capabilities, not copies.** Screens are shared; a variant switches behaviour on or off with capabilities such as `calls.create`, `incidentCommand: 'command'` or `locationTransmission: 'unit'`, then adapts layout by form factor (phone, tablet, desktop, wall).
- **Layered packages.** Lower layers never import higher ones (`config` → `core` → `api` → `auth` … → `features` → `app-shell` → apps), enforced in CI.

**Tech stack:** Expo SDK 57 (prebuild) · React Native 0.86 · React 19 · TypeScript · Expo Router · Zustand · MMKV + SQLite · Axios · gluestack-ui + NativeWind / Tailwind CSS · MapLibre · SignalR · Novu + Notifee · LiveKit · Sentry · Electron · pnpm workspaces · Jest + Testing Library.

## :package: Deployment Options

#### 📱 Mobile Applications
- **Android**: AAB for Google Play and an APK for direct installation
- **iOS**: App Store IPA and an ad-hoc IPA for registered test devices
- Download from the app's [GitHub Release](https://github.com/Resgrid/Omni/releases) (tags such as `unit-v8.12`) or from Firebase App Distribution for testers

#### 🌐 Web Application
- Static web build per app, hostable on any web server or CDN
- Responsive layouts for phones, tablets and desktops

#### 🐳 Docker Container
- One multi-architecture image (amd64, arm64) per app: `resgridllc/responder`, `resgridllc/unit`, `resgridllc/ic`, `resgridllc/dispatch`, `resgridllc/bigboard`
- Configuration through environment variables at runtime; the existing variable names keep working:
  ```bash
  docker pull resgridllc/unit:latest
  docker run -p 8080:80 -e UNIT_BASE_API_URL="https://api.example.com" resgridllc/unit:latest
  ```

#### 🖥️ Desktop Applications (Electron)
- **Windows**: NSIS installer and portable exe
- **macOS**: DMG and ZIP (x64 and arm64)
- **Linux**: AppImage, deb and rpm
- Download from the app's GitHub Release; installed apps update themselves

## :toolbox: Getting Started

> These commands apply once the Phase 0 scaffold lands (see [Roadmap](#compass-roadmap)).

### :gear: Prerequisites

- Node.js 24 and pnpm 10
- For iOS: macOS with Xcode; for Android: Android Studio with JDK 17
- A Resgrid server to sign in to — the hosted service or your own [Resgrid Core](https://github.com/Resgrid/Core) install

### :running: Run Locally

Clone the project and install dependencies
```bash
git clone https://github.com/Resgrid/Omni.git
cd Omni
pnpm install
```

Start an app (pick the variant with `APP_VARIANT`; use `--clear` when switching variants)
```bash
APP_VARIANT=unit pnpm --filter @resgrid/omni start --clear
```

Run on a platform
```bash
APP_VARIANT=responder pnpm --filter @resgrid/omni ios
APP_VARIANT=ic pnpm --filter @resgrid/omni android
APP_VARIANT=dispatch pnpm --filter @resgrid/omni web
APP_VARIANT=bigboard pnpm --filter @resgrid/desktop dev
```

Native builds need the variant's Firebase files (`google-services.json`, `GoogleService-Info.plist`); they are provided by CI and are never committed.

### :test_tube: Quality Checks

```bash
pnpm lint          # ESLint (zero warnings)
pnpm type-check    # TypeScript
pnpm test          # Jest
pnpm i18n:check    # translation key parity across the 10 languages
```

### :hammer: Building

```bash
APP_VARIANT=unit npx eas-cli build --profile unit-production --platform android --local
APP_VARIANT=unit npx expo export -p web --output-dir dist/unit
APP_VARIANT=unit pnpm --filter @resgrid/desktop build
```

Release builds normally come from GitHub Actions (below), not local machines.

## :rocket: Releases and Versioning

GitHub Actions produce every build output. A release run builds each thing once and packages it many times: one web build per app feeds both the Docker image and the desktop installers; one Android build yields the AAB and the APK; one iOS build yields the App Store and ad-hoc IPAs. Native builds run only when native code changed; otherwise the release ships as an over-the-air update. Each app gets its own GitHub Release with every file and a `SHA256SUMS`, and store submission is an optional, approval-gated step.

Versions are derived from the release workflow's run number (`M`) and start above every build the old repositories published:

| App | Version | Android versionCode / iOS build |
|---|---|---|
| Responder | 11.M | 5100000 + M |
| Unit | 8.M | 100000 + M |
| IC | 2.M | 100000 + M |
| Dispatch | 2.M | 100000 + M |
| BigBoard | 4.M | 100000 + M |

Details: [plan §6.6 and Appendix B](docs/architecture/omni-plan.md).

## :handshake: Contributing

- Branch from `develop`, open a pull request; `master` is the release branch.
- Commit messages: `RO-Txxx Summary`.
- Every change ships with tests; CI runs lint, type-check, Jest, translation parity, dependency rules, API contract tests and per-app route checks.
- All user-visible text goes through translations in all ten languages.
- Read [AGENTS.md](AGENTS.md) before contributing — it is the short guide to conventions, layering and the rules that protect existing installs (bundle ids, storage identity, URL schemes). It is also the guide for AI coding agents, alongside the skills in [`.claude/skills`](.claude/skills).

## :compass: Roadmap

* [x] Consolidation plan, agent guide and skills
* [ ] Phase 0 — repo scaffold, variant system, build and storage spikes
* [ ] Phase 1 — shared platform core: API, auth, offline storage and sync, realtime, notifications, location, voice, OTA, release pipeline
* [ ] Phase 2 — UI system and app shells for every form factor
* [ ] Phase 3 — shared features (calls, contacts, chat, records, maps on MapLibre …) with offline support
* [ ] Phase 4 — apps move over one at a time: BigBoard, IC, Dispatch, Unit, Responder
* [ ] Phase 5 — Unit turn-by-turn navigation, route navigation, offline map packs
* [ ] Phase 6 — store submission automation and hardening

## :grey_question: FAQ

- **Can I deploy these apps to Google Play or the Apple App Store?**
  - You can, but you cannot include "Resgrid" in the name of your application or its store listing.
- **What do I need to change to publish my own build?**
  - Edit the variant's identity in `apps/omni/variants/<app>/variant.ts` (bundle id, package, schemes, associated domains, EAS project) and replace the icons, logos and splash images in that variant's `assets/`. Nothing outside the variant folder should need to change.
- **Do the apps work with a self-hosted Resgrid server?**
  - Yes. Each app lets users choose their server, and self-hosted installs can serve their own map tiles, routing and geocoding (see the [Resgrid docs](https://docs.resgrid.com)).
- **Where did the old repositories go?**
  - They keep shipping until their app moves to Omni, then they are archived. Critical fixes made there during the move are mirrored here.

## :warning: License

Distributed under the Apache License 2.0. See [LICENSE](LICENSE) for more information.
