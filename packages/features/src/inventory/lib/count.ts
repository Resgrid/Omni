import type { DataError } from '@resgrid/data';
import type { InventoryCountLine, InventoryEquipment, InventoryFieldLocation } from '@resgrid/models';

/**
 * Pure helpers for the unit inventory screens (Unit `lib/inventory/count`). Row text lives in each row's Content JSON; a
 * protected department without a grant sends it withheld, so parsing never throws and falls back to blanks.
 */
export interface ContentText {
  Name?: string | null;
  Note?: string | null;
  ItemName?: string | null;
  UnitOfMeasure?: string | null;
  SerialNumber?: string | null;
  LotNumber?: string | null;
  AssetTag?: string | null;
  VarianceLineCount?: number | null;
}

export const contentOf = (content?: string | null): ContentText => {
  if (!content || !content.trim().startsWith('{')) return {};
  try {
    const parsed: unknown = JSON.parse(content);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as ContentText) : {};
  } catch {
    return {};
  }
};

export const locationNames = (locations: readonly InventoryFieldLocation[], fallback: string): Record<string, string> =>
  locations.reduce<Record<string, string>>((names, location) => {
    names[location.Id] = location.Name?.trim() || fallback;
    return names;
  }, {});

/** The unit's own location first, then its compartments by name. */
export const orderLocations = (locations: readonly InventoryFieldLocation[]): InventoryFieldLocation[] => [...locations].sort((a, b) => Number(b.IsRoot) - Number(a.IsRoot) || (a.Name ?? '').localeCompare(b.Name ?? ''));

export interface EquipmentRow {
  key: string;
  locationId: string;
  name: string;
  quantity: number;
  serial: string | null;
  /** InventoryAssetStatus for a serialized asset; null for a stock position. */
  assetStatus: number | null;
  issuedCount: number;
}

/** What the unit carries, one row per stock position or serialized asset, grouped by where it sits, sorted by name. */
export const groupEquipment = (equipment: readonly InventoryEquipment[], fallbackName: string): Record<string, EquipmentRow[]> => {
  const groups: Record<string, EquipmentRow[]> = {};
  equipment.forEach((row, index) => {
    const locationId = row.Asset?.CurrentLocationId ?? row.Stock?.LocationId ?? '';
    const details = contentOf(row.Asset?.Content);
    const item: EquipmentRow = {
      key: row.Asset?.Id ?? row.Stock?.Id ?? String(index),
      locationId,
      name: row.ItemName?.trim() || fallbackName,
      quantity: row.Asset ? 1 : (row.Stock?.Quantity ?? 0),
      serial: details.SerialNumber ?? details.AssetTag ?? null,
      assetStatus: row.Asset ? row.Asset.Status : null,
      issuedCount: row.Issuances?.length ?? 0,
    };
    (groups[locationId] ??= []).push(item);
  });
  Object.values(groups).forEach((rows) => rows.sort((a, b) => a.name.localeCompare(b.name)));
  return groups;
};

/** The counted value: what was entered on this device, else what the server already holds, else nothing yet. */
export const observedQuantity = (line: InventoryCountLine, observed: Readonly<Record<string, number>>): number | null => observed[line.Id] ?? line.CountedQuantity ?? null;

export const isComplete = (lines: readonly InventoryCountLine[], observed: Readonly<Record<string, number>>): boolean => lines.length > 0 && lines.every((line) => observedQuantity(line, observed) !== null);

export const variances = (lines: readonly InventoryCountLine[], observed: Readonly<Record<string, number>>): InventoryCountLine[] =>
  lines.filter((line) => {
    const counted = observedQuantity(line, observed);
    return counted !== null && counted !== line.ExpectedQuantity;
  });

/** Most lines one SaveCount takes (the server's atomic posting limit; a count snapshot never holds more). */
export const SAVE_COUNT_MAX_LINES = 100;

/** The entered values the server does not hold yet, as SaveCount lines. */
export const pendingObservations = (lines: readonly InventoryCountLine[], observed: Readonly<Record<string, number>>): { Id: string; Quantity: number }[] =>
  lines.filter((line) => observed[line.Id] !== undefined && observed[line.Id] !== line.CountedQuantity).map((line) => ({ Id: line.Id, Quantity: observed[line.Id] }));

/** A valid count: never negative; a serialized asset is there (1) or not (0); bulk quantities keep 6 decimals. */
export const clampQuantity = (line: Pick<InventoryCountLine, 'AssetId'>, value: number): number => {
  if (!Number.isFinite(value) || value < 0) return 0;
  if (line.AssetId) return value >= 1 ? 1 : 0;
  return Math.round(value * 1_000_000) / 1_000_000;
};

/** Typed text as a quantity ("2,5" → 2.5); null while it is not a number yet. */
export const parseQuantityText = (text: string): number | null => {
  const normalized = text.trim().replace(',', '.');
  if (normalized === '' || normalized === '.' || normalized === '-') return null;
  const value = Number(normalized);
  return Number.isFinite(value) ? value : null;
};

/**
 * The `inventory.errors.*` key for a refusal: the server's problem type (`inventory_CountSnapshotChanged` →
 * `CountSnapshotChanged`), protected data, permission, a concurrent change, else "try again".
 */
export const inventoryErrorKey = (error: DataError | null | undefined): string => {
  if (!error) return 'inventory.errors.retry';
  const type = error.problemType ?? '';
  if (type === 'protected_data_required' || type === 'step_up_required' || type === 'grant_expired') return 'inventory.errors.locked';
  if (type.startsWith('inventory_')) return `inventory.errors.${type.slice('inventory_'.length)}`;
  if (error.code === 'unauthorized' || error.code === 'forbidden' || error.code === 'not_found') return 'inventory.errors.PermissionRequired';
  if (error.code === 'conflict') return 'inventory.errors.CountStateConflict';
  return 'inventory.errors.retry';
};

/** "2026-11-01" in device-local time, for the default count name. */
export const todayKey = (now: Date = new Date()): string => `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
