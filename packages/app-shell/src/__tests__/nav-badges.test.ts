import path from 'node:path';

import type { NavBadge } from '@resgrid/data';

import type { NavRegistry } from '../nav/define-nav';
import { featureNav } from '../nav/feature-nav';
import { navBadgeKeys } from '../shell/badge-counts';

// nav.ts reaches the sign-in screens' language list, which needs the real language constants (jest.setup mocks i18n).
jest.mock('@resgrid/i18n', () => jest.requireActual('@resgrid/i18n'));

const OMNI = path.resolve(__dirname, '..', '..', '..', '..', 'apps', 'omni');
const VARIANTS = ['responder', 'unit', 'ic', 'dispatch', 'bigboard'];

const loadNav = (variant: string): NavRegistry => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const module: { nav: NavRegistry } = require(path.join(OMNI, 'variants', variant, 'nav'));

  return module.nav;
};

/** The count each module's menu entry or tab shows, in every app that routes it (the features' nav.ts declare them). */
const EXPECTED_BADGES = new Map<string, NavBadge>([
  ['calls', 'calls'],
  ['messages', 'messages'],
  ['chat', 'chats'],
  ['notifications', 'notifications'],
  ['weather-alerts', 'weather'],
  ['certifications', 'certifications'],
  ['operations', 'deployments'],
  ['checklists', 'checklists'],
  ['shifts', ['shifts', 'shiftTrades']],
  ['work-orders', 'workOrders'],
  // Calls still awaiting run card resources (Dispatch), counted from the awaiting-resources store.
  ['awaiting-resources', 'awaitingResources'],
]);

describe('nav badges', () => {
  it.each(VARIANTS)('%s: every counted entry (calls, messages, chat, notifications, weather, certifications, deployments, checklists, shifts, work orders) carries its count', (variant) => {
    const entries = loadNav(variant).entries.filter((entry) => EXPECTED_BADGES.has(entry.id));

    for (const entry of entries) {
      expect([entry.id, entry.badge]).toEqual([entry.id, EXPECTED_BADGES.get(entry.id)]);
    }

    // No other entry shows a count.
    expect(loadNav(variant).entries.filter((entry) => entry.badge !== undefined && !EXPECTED_BADGES.has(entry.id))).toEqual([]);
  });

  // The app bar bell opens the inbox and carries its count, so no app also lists it in the menu or tab bar.
  it.each(VARIANTS)('%s: the notifications inbox has no menu or tab entry (the app bar bell opens it)', (variant) => {
    const placements = loadNav(variant)
      .entries.filter((entry) => entry.id === 'notifications')
      .map((entry) => entry.placement);

    expect(placements.filter((placement) => placement !== 'hidden')).toEqual([]);
  });

  it('featureNav keeps a feature badge, and a variant override wins over it', () => {
    const [plain] = featureNav([{ id: 'calls', route: 'calls', titleKey: 'calls.title', badge: 'calls' }], 'sidebar');
    const [overridden] = featureNav([{ id: 'calls', route: 'calls', titleKey: 'calls.title', badge: 'calls' }], 'sidebar', { overrides: { calls: { badge: 'messages' } } });
    const [none] = featureNav([{ id: 'notes', route: 'notes', titleKey: 'notes.title' }], 'sidebar');

    expect(plain.badge).toBe('calls');
    expect(overridden.badge).toBe('messages');
    expect(none).not.toHaveProperty('badge');
  });

  it('collects the distinct counts of the shown entries in a stable order', () => {
    expect(navBadgeKeys([{ entry: { badge: 'chats' } }, { entry: {} }, { entry: { badge: 'calls' } }, { entry: { badge: 'chats' } }])).toEqual(['calls', 'chats']);
  });
});
