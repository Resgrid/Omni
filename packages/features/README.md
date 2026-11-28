# @resgrid/features

Feature modules shared by the five apps (omni-plan §5.1, §7.10–7.11). One folder per domain under
`src/<domain>/` with `screens/`, `components/`, `hooks/`, `lib/`, `routes.ts` (href builders) and `nav.ts`
(nav registry entries). Apps import a feature through its folder (`@resgrid/features/calls`); route files may
re-export a screen by path.

Conventions:

- A feature may import lower layers (`@resgrid/ui`, `@resgrid/data`, `@resgrid/auth`, …). From another
  feature it may import `index.ts`, `routes.ts`, `nav.ts`, `lib/**`, `hooks/**` and `components/**`, plus
  `unit-routes/map-slot`, `status/status-context` and `calls/detail-tabs/registry`. It never imports another
  feature's `screens/**`; take a reused screen from that feature's `index.ts`. Barrels re-export screens, so
  between features that import each other, import the leaf module, not the barrel (a barrel import closes a
  cycle). dependency-cruiser enforces this (`features-cross-domain-public-modules`, omni-plan §5.1).
- **Strings:** use `t('<namespace-free key>')`. Declare every new key with its English text in the
  feature's `src/<domain>/i18n.en.json` (flat `{ "calls.close_title": "Close call" }`). The i18n
  workstream merges these into `@resgrid/i18n` (all ten languages) with
  `npx tsx packages/i18n/scripts/add-keys.ts --features`. Never edit translation JSON files directly
  from a feature.
- Screens are app-agnostic: specialise with `useCapability()`, `useFormFactor()` and props; the
  variant's route file is a one-line re-export.
- Every screen and non-trivial component ships with React Native Testing Library tests.
