import React, { act } from 'react';
import { createRoot, type Root } from 'test-renderer';

import { Heading } from '../../heading/index.web';
// The web builds render DOM elements; the test renderer keeps host elements as plain objects.
import { Text } from '../index.web';

type HostJson = { type: string; props: Record<string, unknown> };

// RNTL 14 always rejects text outside React Native's <Text>, and these builds put text in <span>/<h2>, so they render
// through test-renderer directly (no text-component check).
const roots: Root[] = [];
const render = async (element: React.ReactElement) => {
  const root = createRoot();
  roots.push(root);
  await act(async () => root.render(element));
  return {
    toJSON: () => {
      const [node] = root.container.children;
      return typeof node === 'string' ? node : (node?.toJSON() ?? null);
    },
  };
};

afterEach(async () => {
  for (const root of roots.splice(0)) await act(async () => root.unmount());
});

describe('Text (web)', () => {
  it('renders a span with data-testid instead of testID', async () => {
    const { toJSON } = await render(<Text testID="label">Engine 1</Text>);
    const node = toJSON() as unknown as HostJson;

    expect(node.type).toBe('span');
    expect(node.props['data-testid']).toBe('label');
    expect(node.props).not.toHaveProperty('testID');
  });

  it('clamps text to numberOfLines with a CSS line clamp', async () => {
    const { toJSON } = await render(
      <Text numberOfLines={2} style={[{ color: 'red' }]}>
        Long text
      </Text>
    );
    const node = toJSON() as unknown as HostJson;

    expect(node.props.style).toEqual({ display: '-webkit-box', WebkitBoxOrient: 'vertical', WebkitLineClamp: 2, overflow: 'hidden', color: 'red' });
    expect(node.props).not.toHaveProperty('numberOfLines');
  });

  it('maps accessibility props to aria attributes', async () => {
    const { toJSON } = await render(
      <Text accessibilityRole="header" accessibilityLabel="Call details">
        Details
      </Text>
    );
    const node = toJSON() as unknown as HostJson;

    expect(node.props.role).toBe('heading');
    expect(node.props['aria-label']).toBe('Call details');
    expect(node.props).not.toHaveProperty('accessibilityRole');
  });
});

describe('Heading (web)', () => {
  it('renders the semantic element for its size', async () => {
    const { toJSON } = await render(<Heading size="2xl">Title</Heading>);

    expect((toJSON() as unknown as HostJson).type).toBe('h2');
  });

  it('supports numberOfLines (line clamp) and testID', async () => {
    const { toJSON } = await render(
      <Heading numberOfLines={1} testID="heading">
        A very long title
      </Heading>
    );
    const node = toJSON() as unknown as HostJson;

    expect(node.props['data-testid']).toBe('heading');
    expect(node.props.style).toMatchObject({ WebkitLineClamp: 1, overflow: 'hidden' });
  });
});
