import { render } from '@testing-library/react-native';
import React from 'react';

import { FlatList } from '../index';

const mockFlashList = jest.fn((_props: Record<string, unknown>) => null);
jest.mock('@shopify/flash-list', () => ({ FlashList: (props: Record<string, unknown>) => mockFlashList(props) }));

const lastProps = () => mockFlashList.mock.calls[mockFlashList.mock.calls.length - 1][0];

beforeEach(() => mockFlashList.mockClear());

describe('FlatList', () => {
  it('turns off FlashList’s visible-position anchoring so a list whose filter is cleared starts at the top', async () => {
    await render(<FlatList data={['a', 'b']} renderItem={() => null} />);
    expect(lastProps().maintainVisibleContentPosition).toEqual({ disabled: true });
    expect(lastProps().data).toEqual(['a', 'b']);
  });

  it('keeps a screen’s own anchoring config, as chat passes', async () => {
    const config = { startRenderingFromBottom: true, autoscrollToBottomThreshold: 0.2 };
    await render(<FlatList data={['a']} renderItem={() => null} maintainVisibleContentPosition={config} />);
    expect(lastProps().maintainVisibleContentPosition).toBe(config);
  });
});
