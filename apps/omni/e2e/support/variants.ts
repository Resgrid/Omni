import fs from 'node:fs';
import path from 'node:path';

// Acceptance tests read the variant manifests straight from disk (no app packages), so they run against any
// build output — web export, packaged Electron app — without transforming app code.
export const VARIANT_IDS = ['responder', 'unit', 'ic', 'dispatch', 'bigboard'] as const;
export type VariantId = (typeof VARIANT_IDS)[number];

/** The parts of `variants/<id>/variant.json` the acceptance suites use. */
export interface VariantManifest {
  id: VariantId;
  displayName: string;
  identity: {
    name: string;
    slug: string;
    easProjectId: string;
    ios: { bundleIdentifier: string };
    android: { package: string };
    schemes: string[];
    electron: { appId: string; productName: string; protocol: string | null };
  };
  capabilities: { platform: { webEdition: boolean; electron: boolean } };
  shell: { homeRoute: string };
}

export const e2eRoot = path.resolve(__dirname, '..');
export const omniRoot = path.resolve(e2eRoot, '..');
export const repoRoot = path.resolve(omniRoot, '..', '..');

export function isVariantId(value: string): value is VariantId {
  return (VARIANT_IDS as readonly string[]).includes(value);
}

export function loadManifest(id: VariantId): VariantManifest {
  return JSON.parse(fs.readFileSync(path.join(omniRoot, 'variants', id, 'variant.json'), 'utf8')) as VariantManifest;
}

export function otherVariants(id: VariantId): VariantManifest[] {
  return VARIANT_IDS.filter((v) => v !== id).map(loadManifest);
}

/** `apps/omni/dist/<variant>` — written by `APP_VARIANT=<v> pnpm --filter @resgrid/omni web:export`. */
export function webExportDir(id: VariantId): string {
  return path.join(omniRoot, 'dist', id);
}

export function hasWebExport(id: VariantId): boolean {
  return fs.existsSync(path.join(webExportDir(id), 'index.html'));
}

/**
 * Variants for the web projects: `E2E_VARIANT` (comma-separated or `all`) when set, otherwise every variant
 * that has a web export on disk.
 */
export function selectedWebVariants(env: NodeJS.ProcessEnv = process.env): VariantId[] {
  const raw = env.E2E_VARIANT?.trim();
  if (!raw) return VARIANT_IDS.filter(hasWebExport);
  if (raw === 'all') return [...VARIANT_IDS];
  return raw
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean)
    .map((v) => {
      if (!isVariantId(v)) throw new Error(`E2E_VARIANT: unknown variant "${v}". Expected one of: ${VARIANT_IDS.join(', ')}.`);
      return v;
    });
}
