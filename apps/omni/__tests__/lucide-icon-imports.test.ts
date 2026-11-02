import { transformSync } from '@babel/core';

// eslint-disable-next-line @typescript-eslint/no-require-imports -- the Babel plugin is a CommonJS module
const lucideIconImports = require('../babel/lucide-icon-imports');

const transform = (code: string): string => transformSync(code, { filename: 'screen.tsx', babelrc: false, configFile: false, plugins: [lucideIconImports], parserOpts: { plugins: ['typescript', 'jsx'] } })?.code ?? '';

const importedPaths = (code: string): string[] => [...code.matchAll(/from "(lucide-react-native\/[^"]+)"/g)].map((match) => match[1]);

describe('lucide-icon-imports (babel)', () => {
  it('imports each icon from its own module, aliases included', () => {
    const out = transform(`import { Bell, AlertTriangle as Warning, MapPinIcon } from 'lucide-react-native';`);
    expect(out).toContain('import Bell from "lucide-react-native/dist/esm/icons/bell.js";');
    expect(out).toContain('import Warning from "lucide-react-native/dist/esm/icons/triangle-alert.js";');
    expect(out).toContain('import MapPinIcon from "lucide-react-native/dist/esm/icons/map-pin.js";');
    expect(out).not.toContain("from 'lucide-react-native'");
  });

  it('points at icon modules that exist in the installed package', () => {
    const paths = importedPaths(transform(`import { Bell, Radio, Users } from 'lucide-react-native';`));
    expect(paths).toHaveLength(3);
    for (const modulePath of paths) expect(() => require.resolve(modulePath)).not.toThrow();
  });

  it('keeps type imports and non-icon exports on the package entry', () => {
    const out = transform(`import { Bell, type LucideIcon, createLucideIcon } from 'lucide-react-native';\nimport type { LucideProps } from 'lucide-react-native';`);
    expect(out).toContain("import { type LucideIcon, createLucideIcon } from 'lucide-react-native';");
    expect(out).toContain("import type { LucideProps } from 'lucide-react-native';");
    expect(out).toContain('import Bell from "lucide-react-native/dist/esm/icons/bell.js";');
  });

  it('turns an import left with only types into `import type`, so the icon set is not loaded at runtime', () => {
    const out = transform(`import { Bell, type LucideIcon } from 'lucide-react-native';`);
    expect(out).toContain("import type { LucideIcon } from 'lucide-react-native';");
  });

  it('leaves other packages alone', () => {
    const source = `import { Bell } from 'some-icons';`;
    expect(transform(source)).toBe(source);
  });
});
