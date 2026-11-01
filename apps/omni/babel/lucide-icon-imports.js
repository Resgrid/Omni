// Rewrites `import { Bell, MapPin } from 'lucide-react-native'` into one default import per icon module
// (`lucide-react-native/icons/bell`, the package's public per-icon export). Metro does not tree-shake, so the package
// entry would put all ~2,000 icons into every bundle (1.2 MB of the web export) when the apps use a few hundred. Type
// imports and the package's other exports (createLucideIcon, Icon, LucideProvider) stay on the package entry.
const fs = require('fs');
const path = require('path');

const PACKAGE = 'lucide-react-native';

let iconModules = null;

/** The installed package folder. Its `exports` map does not expose `package.json`, so walk up from the main entry. */
function packageRoot() {
  let dir = path.dirname(require.resolve(PACKAGE));
  while (!isPackageDir(dir)) {
    const parent = path.dirname(dir);
    if (parent === dir) throw new Error(`lucide-icon-imports: cannot find the ${PACKAGE} package folder.`);
    dir = parent;
  }
  return dir;
}

function isPackageDir(dir) {
  const manifest = path.join(dir, 'package.json');
  return fs.existsSync(manifest) && JSON.parse(fs.readFileSync(manifest, 'utf8')).name === PACKAGE;
}

/** Export name (including the `XIcon`/`LucideX` and renamed aliases) → icon module path, read from the ESM entry. */
function loadIconModules() {
  if (iconModules) return iconModules;
  const entry = path.join(packageRoot(), 'dist', 'esm', `${PACKAGE}.mjs`);
  const exportLine = /^export \{ ([^}]+) \} from '\.\/icons\/([\w-]+)\.mjs';$/;
  iconModules = new Map();
  for (const line of fs.readFileSync(entry, 'utf8').split('\n')) {
    const match = exportLine.exec(line.trim());
    if (!match) continue;
    for (const specifier of match[1].split(',')) {
      const alias = /^default as (\w+)$/.exec(specifier.trim());
      if (alias) iconModules.set(alias[1], `${PACKAGE}/icons/${match[2]}`);
    }
  }
  if (iconModules.size === 0) throw new Error(`lucide-icon-imports: no icon exports found in ${entry}; the package layout changed.`);
  return iconModules;
}

module.exports = function lucideIconImports({ types: t }) {
  return {
    name: 'lucide-icon-imports',
    visitor: {
      ImportDeclaration(nodePath) {
        const { node } = nodePath;
        if (node.source.value !== PACKAGE || node.importKind === 'type') return;
        const modules = loadIconModules();
        const kept = [];
        const iconImports = [];
        for (const specifier of node.specifiers) {
          const imported = t.isImportSpecifier(specifier) ? (t.isIdentifier(specifier.imported) ? specifier.imported.name : specifier.imported.value) : null;
          const modulePath = imported && specifier.importKind !== 'type' ? modules.get(imported) : undefined;
          if (modulePath) {
            iconImports.push(t.importDeclaration([t.importDefaultSpecifier(t.identifier(specifier.local.name))], t.stringLiteral(modulePath)));
          } else {
            kept.push(specifier);
          }
        }
        if (iconImports.length === 0) return;
        if (kept.length > 0) {
          node.specifiers = kept;
          // `import { Bell, type LucideIcon }` leaves only types: make it `import type` so no runtime import of the
          // package entry (the whole icon set) survives the TypeScript transform.
          if (kept.every((specifier) => specifier.importKind === 'type')) {
            node.importKind = 'type';
            for (const specifier of kept) specifier.importKind = null;
          }
          nodePath.insertAfter(iconImports);
        } else {
          nodePath.replaceWithMultiple(iconImports);
        }
      },
    },
  };
};
