import '../../calls/__tests__/test-setup';

import { useProtocolsStore } from '@resgrid/data';
import type { CallProtocolsResultData } from '@resgrid/models';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { router, useLocalSearchParams } from 'expo-router';
import React from 'react';

import { hidden } from '../../calls/__tests__/test-utils';
import { ProtocolContent } from '../components/protocol-content';
import ProtocolDetailScreen from '../screens/protocol-detail';
import ProtocolListScreen, { searchProtocols } from '../screens/protocol-list';

const protocol = (Id: string, overrides: Partial<CallProtocolsResultData> = {}): CallProtocolsResultData =>
  ({
    Id,
    DepartmentId: '1',
    Name: `Protocol ${Id}`,
    Code: `P-${Id}`,
    Description: '<p>Use for <b>fires</b></p>',
    ProtocolText: '<h1>Steps</h1><script>steal()</script><a href="javascript:alert(1)">bad</a>',
    CreatedOn: '2026-10-01T00:00:00Z',
    CreatedByUserId: '',
    IsDisabled: false,
    UpdatedOn: '',
    UpdatedByUserId: '',
    MinimumWeight: 0,
    State: 0,
    Triggers: [],
    Attachments: [],
    Questions: [],
    ...overrides,
  }) as CallProtocolsResultData;

const mockFetchProtocol = jest.fn();

beforeEach(() => {
  jest.mocked(router.push).mockClear();
  jest.mocked(router.back).mockClear();
  jest.mocked(router.replace).mockClear();
  jest.mocked(useLocalSearchParams).mockReturnValue({});
  mockFetchProtocol.mockReset();
  // Like the store: the detail read lands in the persisted details cache (only ids the server knows).
  mockFetchProtocol.mockImplementation(async (id: string) => {
    const listed = useProtocolsStore.getState().protocols.find((item) => item.Id === id);

    if (!listed) return null;

    const full = { ...listed, ProtocolText: '<p>Full text</p>' };

    useProtocolsStore.setState((state) => ({ protocolDetailsById: { ...state.protocolDetailsById, [id]: full } }));

    return full;
  });
  useProtocolsStore.setState({
    protocols: [protocol('1'), protocol('2', { Name: 'Hazmat', Code: 'HZ' }), protocol('3', { IsDisabled: true })],
    protocolDetailsById: {},
    loading: {},
    fetchProtocols: jest.fn(async () => undefined),
    fetchProtocol: mockFetchProtocol,
  });
});

describe('protocols', () => {
  it('searches enabled protocols by name, code and description', () => {
    const list = useProtocolsStore.getState().protocols;
    expect(searchProtocols(list, '').map((item) => item.Id)).toEqual(['1', '2']);
    expect(searchProtocols(list, 'hz').map((item) => item.Id)).toEqual(['2']);
  });

  it('lists protocols with plain-text previews and opens a protocol as its own page', async () => {
    await render(<ProtocolListScreen />);
    expect(screen.getByText('Protocol 1')).toBeTruthy();
    expect(screen.getAllByText('Use for fires').length).toBeGreaterThan(0);
    expect(screen.queryByText('Protocol 3')).toBeNull();
    await fireEvent.changeText(screen.getByTestId('protocol-search'), 'hazmat');
    expect(screen.queryByText('Protocol 1')).toBeNull();
    await fireEvent.press(screen.getByTestId('protocol-card-2'));
    expect(router.push).toHaveBeenCalledWith('/protocols/2');
    expect(screen.queryByTestId('webview-html', hidden)).toBeNull();
  });

  it('shows the listed copy on the page, then the full text from the detail read', async () => {
    jest.mocked(useLocalSearchParams).mockReturnValue({ id: '2' });
    await render(<ProtocolDetailScreen />);
    expect(mockFetchProtocol).toHaveBeenCalledWith('2');
    expect(screen.getAllByText('Hazmat').length).toBeGreaterThan(0);
    expect(screen.getByLabelText('protocols.details.code: HZ')).toBeTruthy();
    expect(String(screen.getByTestId('webview-html', hidden).props.children)).toContain('Full text');
    expect(screen.getByText(/^protocols\.details\.updated: /)).toBeTruthy();
  });

  it('goes back, or to the protocols list when there is no history', async () => {
    await render(<ProtocolDetailScreen protocolId="1" />);
    await fireEvent.press(screen.getByTestId('back-button'));
    expect(router.back).toHaveBeenCalledTimes(1);
    jest.mocked(router.canGoBack).mockReturnValueOnce(false);
    await fireEvent.press(screen.getByTestId('back-button'));
    expect(router.replace).toHaveBeenCalledWith('/protocols');
  });

  it('says a protocol the server does not know was not found, and rejects an unsafe route id', async () => {
    await render(<ProtocolDetailScreen protocolId="9" />);
    expect(mockFetchProtocol).toHaveBeenCalledWith('9');
    expect(screen.getByTestId('protocol-detail-missing')).toBeTruthy();
    mockFetchProtocol.mockClear();
    jest.mocked(useLocalSearchParams).mockReturnValue({ id: '../settings' });
    await render(<ProtocolDetailScreen />);
    expect(screen.getByTestId('protocol-detail-missing')).toBeTruthy();
    expect(mockFetchProtocol).not.toHaveBeenCalled();
  });

  it('renders protocol text only through HtmlRenderer, sanitized', async () => {
    await render(<ProtocolContent protocol={protocol('1')} />);
    const html = String(screen.getByTestId('webview-html').props.children);
    expect(html).toContain('<h1>Steps</h1>');
    // The text sizes itself (autoHeight): the only script is the renderer's own nonce-carrying height reporter.
    expect(html).not.toContain('steal()');
    expect(html.match(/<script/g)).toHaveLength(1);
    expect(html).toMatch(/<script nonce="[a-z0-9]+">/i);
    expect(html).not.toContain('javascript:');
    expect(screen.getByTestId('protocol-content-html').props.javaScriptEnabled).toBe(true);
    expect(screen.getByLabelText('protocols.details.code: P-1')).toBeTruthy();
  });

  it('shows the empty state', async () => {
    useProtocolsStore.setState({ protocols: [] });
    await render(<ProtocolListScreen />);
    expect(screen.getByTestId('protocol-list-empty')).toBeTruthy();
  });
});
