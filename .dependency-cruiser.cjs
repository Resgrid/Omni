// Layer rules (omni-plan §5.2). A package may import only from lower layers.
//   L0 config, models · L1 core, i18n · L2 api, offline · L3 auth, realtime, notifications, location,
//   voice, maps · L4 data · L5 ui (L0–L1 only) · L6 features, navigation · L7 app-shell · L8 apps
const layers = {
  config: 0,
  models: 0,
  core: 1,
  i18n: 1,
  api: 2,
  offline: 2,
  auth: 3,
  realtime: 3,
  notifications: 3,
  location: 3,
  voice: 3,
  maps: 3,
  data: 4,
  ui: 5,
  features: 6,
  navigation: 6,
  'app-shell': 7,
};

const forbidden = [];
for (const [from, level] of Object.entries(layers)) {
  const higher = Object.entries(layers)
    .filter(([name, l]) => l > level && name !== from)
    .map(([name]) => name);
  if (higher.length) {
    forbidden.push({
      name: `layer-${from}`,
      comment: `@resgrid/${from} (L${level}) must not import higher layers`,
      severity: 'error',
      from: { path: `^packages/${from}/` },
      to: { path: `^packages/(${higher.join('|')})/` },
    });
  }
}

// ui is L5 but may only depend on config, core and i18n (omni-plan §5.2).
forbidden.push({
  name: 'ui-only-core-deps',
  comment: '@resgrid/ui may import only config, core and i18n',
  severity: 'error',
  from: { path: '^packages/ui/' },
  to: { path: '^packages/(models|api|offline|auth|realtime|notifications|location|voice|maps|data)/' },
});

// data stores never import UI or React Native UI APIs.
forbidden.push({
  name: 'data-no-react-native-ui',
  comment: 'Stores in @resgrid/data must not import React Native UI modules',
  severity: 'error',
  from: { path: '^packages/data/' },
  to: { path: '^node_modules/(react-native/Libraries/(Alert|Linking|Components)|@gluestack-ui|lucide-react-native)' },
});

// Packages never import app code.
forbidden.push({
  name: 'packages-no-apps',
  severity: 'error',
  from: { path: '^packages/' },
  to: { path: '^apps/' },
});

forbidden.push({ name: 'no-circular', severity: 'error', from: { path: '^packages/' }, to: { circular: true } });

module.exports = {
  forbidden,
  options: {
    doNotFollow: { path: 'node_modules' },
    exclude: { path: '(node_modules|__tests__|\\.test\\.|apps/omni/(ios|android)|apps/desktop/(out|release))' },
    tsConfig: { fileName: 'tsconfig.json' },
    tsPreCompilationDeps: true,
    enhancedResolveOptions: { exportsFields: ['exports'], conditionNames: ['import', 'require', 'node', 'default'] },
  },
};
