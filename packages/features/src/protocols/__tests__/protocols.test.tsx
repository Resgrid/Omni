import '../../calls/__tests__/test-setup';

import { useProtocolsStore } from '@resgrid/data';
import type { CallProtocolsResultData } from '@resgrid/models';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';

import { hidden } from '../../calls/__tests__/test-utils';
import { ProtocolContent } from '../components/protocol-content';
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
  mockFetchProtocol.mockImplementation(async (id: string) => protocol(id, { ProtocolText: '<p>Full text</p>' }));
  useProtocolsStore.setState({
    protocols: [protocol('1'), protocol('2', { Name: 'Hazmat', Code: 'HZ' }), protocol('3', { IsDisabled: true })],
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

  it('lists protocols with plain-text previews and opens the details sheet with the full text', async () => {
    render(<ProtocolListScreen />);
    expect(screen.getByText('Protocol 1')).toBeTruthy();
    expect(screen.getAllByText('Use for fires').length).toBeGreaterThan(0);
    expect(screen.queryByText('Protocol 3')).toBeNull();
    fireEvent.changeText(screen.getByTestId('protocol-search'), 'hazmat');
    expect(screen.queryByText('Protocol 1')).toBeNull();
    await act(async () => fireEvent.press(screen.getByTestId('protocol-card-2')));
    expect(mockFetchProtocol).toHaveBeenCalledWith('2');
    expect(String(screen.getByTestId('webview-html', hidden).props.children)).toContain('Full text');
  });

  it('renders protocol text only through HtmlRenderer, sanitized', () => {
    render(<ProtocolContent protocol={protocol('1')} />);
    const html = String(screen.getByTestId('webview-html').props.children);
    expect(html).toContain('<h1>Steps</h1>');
    expect(html).not.toContain('<script');
    expect(html).not.toContain('javascript:');
    expect(screen.getByLabelText('protocols.details.code: P-1')).toBeTruthy();
  });

  it('shows the empty state', () => {
    useProtocolsStore.setState({ protocols: [] });
    render(<ProtocolListScreen />);
    expect(screen.getByTestId('protocol-list-empty')).toBeTruthy();
  });
});
