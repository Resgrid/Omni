import fs from 'fs';
import path from 'path';

/** Source-level guards for the calls cluster (AGENTS.md security and layering rules). */
const FEATURES_SRC = path.resolve(__dirname, '..', '..');
const FOLDERS = ['calls', 'check-in', 'video-feeds', 'protocols', 'notes'];

const walk = (dir: string): string[] =>
  fs
    .readdirSync(dir, { withFileTypes: true })
    .flatMap((entry) => (entry.isDirectory() ? (entry.name === '__tests__' ? [] : walk(path.join(dir, entry.name))) : /\.tsx?$/.test(entry.name) ? [path.join(dir, entry.name)] : []));

const sources = FOLDERS.flatMap((folder) => walk(path.join(FEATURES_SRC, folder))).map((file) => ({ file: path.relative(FEATURES_SRC, file).replace(/\\/g, '/'), text: fs.readFileSync(file, 'utf8') }));

describe('calls cluster source rules', () => {
  it('renders server HTML only through HtmlRenderer: no raw WebView outside the video feed page surface', () => {
    const offenders = sources.filter(({ file, text }) => /from 'react-native-webview'/.test(text) && file !== 'video-feeds/components/video-feed-surface.tsx').map(({ file }) => file);
    expect(offenders).toEqual([]);
    for (const file of ['protocols/components/protocol-content.tsx', 'notes/components/note-details-sheet.tsx', 'calls/components/detail/call-info-panel.tsx', 'calls/screens/call-detail.tsx']) {
      expect(sources.find((source) => source.file === file)?.text).toContain('HtmlRenderer');
    }
  });

  it("never imports React Native's Modal, the maps package or the app shell", () => {
    expect(sources.filter(({ text }) => /import\s*\{[^}]*\bModal\b[^}]*\}\s*from 'react-native'/.test(text)).map(({ file }) => file)).toEqual([]);
    expect(sources.filter(({ text }) => /from '@resgrid\/(maps|app-shell)/.test(text)).map(({ file }) => file)).toEqual([]);
  });

  it('imports other features only through their index', () => {
    const crossFeatureDeep = sources.filter(({ file, text }) => {
      const own = file.split('/')[0];
      return [...text.matchAll(/from '((?:\.\.\/)+)(calls|check-in|video-feeds|protocols|notes)\/[^']+'/g)].some((match) => match[2] !== own);
    });
    expect(crossFeatureDeep.map(({ file }) => file)).toEqual([]);
  });

  it('never loads expo-video statically (variants without the native module must not load it)', () => {
    expect(sources.filter(({ text }) => /^import (?!type)[^;]*from 'expo-video'/m.test(text)).map(({ file }) => file)).toEqual([]);
  });
});
