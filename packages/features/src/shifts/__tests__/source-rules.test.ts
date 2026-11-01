import fs from 'fs';
import path from 'path';

/** Source-level guards for the Responder member modules (AGENTS.md conventions): shifts, messages, work-orders. */
const FEATURES_SRC = path.resolve(__dirname, '..', '..');
const FOLDERS = ['shifts', 'messages', 'work-orders'];

const walk = (dir: string): string[] =>
  fs
    .readdirSync(dir, { withFileTypes: true })
    .flatMap((entry) => (entry.isDirectory() ? (entry.name === '__tests__' ? [] : walk(path.join(dir, entry.name))) : /\.tsx?$/.test(entry.name) ? [path.join(dir, entry.name)] : []));

const sources = FOLDERS.flatMap((folder) => walk(path.join(FEATURES_SRC, folder))).map((file) => ({ file: path.relative(FEATURES_SRC, file).replace(/\\/g, '/'), text: fs.readFileSync(file, 'utf8') }));

const offenders = (pattern: RegExp): string[] => sources.filter(({ text }) => pattern.test(text)).map(({ file }) => file);

describe('member module source rules', () => {
  it("never imports React Native's Modal or Alert, a raw WebView, the maps package or the app shell", () => {
    expect(offenders(/import\s*\{[^}]*\b(Modal|Alert)\b[^}]*\}\s*from 'react-native'/)).toEqual([]);
    expect(offenders(/from 'react-native-webview'/)).toEqual([]);
    expect(offenders(/from '@resgrid\/(maps|app-shell)/)).toEqual([]);
  });

  it('imports other features only through @resgrid/features/<folder>', () => {
    const deep = sources.filter(({ file, text }) => {
      const own = file.split('/')[0];
      return [...text.matchAll(/from '((?:\.\.\/){2,})([a-z-]+)\//g)].some((match) => match[2] !== own) || /^(import|export)\b[^\n]*from '@resgrid\/features\/[a-z-]+\//m.test(text);
    });
    expect(deep.map(({ file }) => file)).toEqual([]);
  });

  it('renders conditionally with ternaries, never `cond && <Jsx />`', () => {
    expect(offenders(/&&\s*\(?\s*<[A-Za-z]/)).toEqual([]);
  });

  it('never calls the API directly or logs', () => {
    expect(offenders(/from '@resgrid\/api'/)).toEqual([]);
    expect(offenders(/console\.(log|warn|error|info)/)).toEqual([]);
  });

  it('every folder declares its nav entries, routes and English strings', () => {
    for (const folder of FOLDERS) {
      expect(fs.existsSync(path.join(FEATURES_SRC, folder, 'nav.ts'))).toBe(true);
      expect(fs.existsSync(path.join(FEATURES_SRC, folder, 'routes.ts'))).toBe(true);
      expect(() => JSON.parse(fs.readFileSync(path.join(FEATURES_SRC, folder, 'i18n.en.json'), 'utf8'))).not.toThrow();
    }
  });
});
