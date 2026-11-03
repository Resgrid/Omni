import { render, screen } from '@testing-library/react-native';
import React from 'react';
import { Text } from 'react-native';

import { GluestackUIProvider } from '../index.web';

// The web provider writes the theme onto <html>; Jest runs without a DOM, so a stand-in documentElement records it.
function mockDocument() {
  const classes = new Set<string>();

  const documentElement = {
    classList: { add: (name: string) => classes.add(name), remove: (name: string) => classes.delete(name) },
    style: { colorScheme: '' },
  };

  Object.defineProperty(globalThis, 'document', { value: { documentElement }, configurable: true });

  return { classes, documentElement };
}

describe('GluestackUIProvider (web)', () => {
  afterEach(() => {
    Reflect.deleteProperty(globalThis, 'document');
  });

  it('renders no inline <script> (React never runs one in the client-only export and warns about it)', async () => {
    mockDocument();

    await render(
      <GluestackUIProvider mode="dark">
        <Text>child</Text>
      </GluestackUIProvider>
    );

    expect(screen.getByText('child')).toBeTruthy();
    expect(JSON.stringify(screen.toJSON())).not.toContain('"type":"script"');
  });

  it('sets the theme class and color-scheme on the document', async () => {
    const { classes, documentElement } = mockDocument();
    classes.add('light');

    await render(<GluestackUIProvider mode="dark" />);

    expect([...classes]).toEqual(['dark']);
    expect(documentElement.style.colorScheme).toBe('dark');
  });
});
