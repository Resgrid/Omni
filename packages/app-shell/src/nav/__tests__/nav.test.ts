import type { Capabilities, FeatureModuleId } from '@resgrid/config';
import { MapIcon, MessageCircleIcon, SettingsIcon } from 'lucide-react-native';

import { loadManifest } from '../../__tests__/helpers/variants';
import { defineNav, navRouteName } from '../define-nav';
import { buildTabScreens, filterNav, findUnregisteredRoutes, type NavFilterContext, resolveNavLabel } from '../filter';

const unit = loadManifest('unit');

const contextFor = (flags: Record<string, boolean>, overrides: Partial<NavFilterContext> = {}): NavFilterContext => ({
  isFlagEnabled: (key) => flags[key] === true,
  capabilities: unit.capabilities,
  hasModule: (moduleId: FeatureModuleId) => unit.modules.includes(moduleId),
  ...overrides,
});

const nav = defineNav([
  { id: 'settings', href: '/settings', placement: 'tab', icon: SettingsIcon, labelKey: 'tabs.settings', order: 90 },
  { id: 'map', href: '/', placement: 'tab', icon: MapIcon, labelKey: 'tabs.map', termKey: 'module.mapping', order: 0 },
  { id: 'chat', href: '/chat', placement: 'sidebar', icon: MessageCircleIcon, labelKey: 'tabs.chat', requiresFlag: 'Chat.System' },
  { id: 'records', href: '/records', placement: 'sidebar', labelKey: 'tabs.records', requiresFlag: ['Records.System', 'Records.Field.Unit'], termKey: 'module.records' },
  { id: 'inventory', href: '/inventory', placement: 'sidebar', labelKey: 'inventory.title', requiresModule: 'inventory' },
  { id: 'command', href: '/command', placement: 'sidebar', labelKey: 'command.title', requiresCapability: (caps: Capabilities) => caps.incidentCommand === 'command' },
  { id: 'account-security', href: '/account-security', placement: 'hidden', labelKey: 'mfa.account.title' },
]);

describe('defineNav', () => {
  it('sorts by order, keeping declaration order for entries without one', () => {
    expect(nav.entries.map((entry) => entry.id)).toEqual(['map', 'settings', 'chat', 'records', 'inventory', 'command', 'account-security']);
  });

  it('derives tab route names from hrefs', () => {
    expect(navRouteName({ href: '/' })).toBe('index');
    expect(navRouteName({ href: '/weather-alerts' })).toBe('weather-alerts');
    expect(navRouteName({ href: '/maps', routeName: 'maps/index' })).toBe('maps/index');
  });

  it('rejects duplicate ids, duplicate routes, relative hrefs and missing labels', () => {
    expect(() =>
      defineNav([
        { id: 'a', href: '/a', placement: 'tab', labelKey: 'x' },
        { id: 'a', href: '/b', placement: 'tab', labelKey: 'x' },
      ])
    ).toThrow(/duplicate entry id/);
    expect(() =>
      defineNav([
        { id: 'a', href: '/a', placement: 'tab', labelKey: 'x' },
        { id: 'b', href: '/a', placement: 'tab', labelKey: 'x' },
      ])
    ).toThrow(/two entries use the route/);
    expect(() => defineNav([{ id: 'a', href: 'a', placement: 'tab', labelKey: 'x' }])).toThrow(/absolute path/);
    expect(() => defineNav([{ id: 'a', href: '/a', placement: 'tab', labelKey: '' }])).toThrow(/labelKey/);
  });

  it('finds entries by href (trailing slashes and queries ignored)', () => {
    expect(nav.findByHref('/settings/')?.id).toBe('settings');
    expect(nav.findByHref('/chat?x=1')?.id).toBe('chat');
    expect(nav.findByHref('/nope')).toBeUndefined();
  });
});

describe('filterNav', () => {
  it('hides flag-gated entries until every flag is enabled (unknown flags are disabled)', () => {
    const ids = (flags: Record<string, boolean>) => filterNav(nav.entries, contextFor(flags)).map((entry) => entry.id);
    expect(ids({})).toEqual(['map', 'settings', 'inventory']);
    expect(ids({ 'Chat.System': true })).toContain('chat');
    expect(ids({ 'Records.System': true })).not.toContain('records');
    expect(ids({ 'Records.System': true, 'Records.Field.Unit': true })).toContain('records');
  });

  it('gates on modules and capabilities', () => {
    expect(filterNav(nav.entries, contextFor({}, { hasModule: () => false })).map((entry) => entry.id)).not.toContain('inventory');
    const commander = contextFor({}, { capabilities: { ...unit.capabilities, incidentCommand: 'command' } });
    expect(filterNav(nav.entries, commander).map((entry) => entry.id)).toContain('command');
    expect(filterNav(nav.entries, contextFor({})).map((entry) => entry.id)).not.toContain('command');
  });

  it('hides an entry whose capability check throws instead of breaking the menu', () => {
    const broken = defineNav([
      {
        id: 'x',
        href: '/x',
        placement: 'sidebar',
        labelKey: 'x',
        requiresCapability: () => {
          throw new Error('bad');
        },
      },
    ]);
    expect(filterNav(broken.entries, contextFor({}))).toEqual([]);
  });

  it('filters by placement (hidden entries never show in menus)', () => {
    expect(filterNav(nav.entries, contextFor({ 'Chat.System': true }), ['sidebar']).map((entry) => entry.id)).toEqual(['chat', 'inventory']);
    expect(filterNav(nav.entries, contextFor({}), ['tab', 'sidebar', 'hidden']).map((entry) => entry.id)).toContain('account-security');
  });
});

describe('resolveNavLabel', () => {
  const translate = (key: string, fallback: string) => (key === 'tabs.map' ? 'Map' : fallback);

  it("uses the department's own name when it renamed the module", () => {
    const map = nav.get('map');
    expect(map).toBeDefined();
    expect(resolveNavLabel(map!, { terms: { 'module.mapping': 'Area Map' }, translate })).toBe('Area Map');
  });

  it('falls back to the translated label when the term is missing or blank', () => {
    const map = nav.get('map')!;
    expect(resolveNavLabel(map, { terms: {}, translate })).toBe('Map');
    expect(resolveNavLabel(map, { terms: { 'module.mapping': '  ' }, translate })).toBe('Map');
    expect(resolveNavLabel(nav.get('settings')!, { terms: {}, translate })).toBe('settings');
  });
});

describe('buildTabScreens', () => {
  it('gives every registered route a screen, but tab buttons only to available tab entries', () => {
    const screens = buildTabScreens(nav.entries, contextFor({ 'Chat.System': true }), (entry) => entry.labelKey);
    expect(screens.map((screen) => [screen.name, screen.visible])).toEqual([
      ['index', true],
      ['settings', true],
      ['chat', false],
      ['records', false],
      ['inventory', false],
      ['command', false],
      ['account-security', false],
    ]);
  });

  it('hides a gated tab (href: null) rather than dropping its screen', () => {
    const gated = defineNav([{ id: 'calls', href: '/calls', placement: 'tab', labelKey: 'tabs.calls', requiresFlag: 'Calls.Off' }]);
    expect(buildTabScreens(gated.entries, contextFor({}), () => 'Calls')).toEqual([expect.objectContaining({ name: 'calls', visible: false })]);
  });
});

describe('findUnregisteredRoutes', () => {
  it('reports (app) routes without a registry entry, ignoring special routes', () => {
    expect(findUnregisteredRoutes(['index', 'settings', 'orphan', '+not-found', '_sitemap'], nav.entries)).toEqual(['orphan']);
  });
});
