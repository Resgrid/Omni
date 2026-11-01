import '../../calls/__tests__/test-setup';

import { useNotesStore } from '@resgrid/data';
import type { NoteResultData } from '@resgrid/models';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';

import { hidden } from '../../calls/__tests__/test-utils';
import NoteListScreen from '../screens/note-list';

const note = (NoteId: string, overrides: Partial<NoteResultData> = {}): NoteResultData =>
  ({
    NoteId,
    UserId: '',
    Title: `Note ${NoteId}`,
    Body: '<p>Gate code <b>1234</b></p><img src=x onerror="steal()">',
    Color: '#2563EB',
    Category: 'Access',
    ExpiresOn: '',
    AddedOn: '2026-10-30T10:00:00Z',
    ...overrides,
  }) as NoteResultData;

beforeEach(() => {
  jest.useFakeTimers();
  useNotesStore.setState({ notes: [note('1'), note('2', { Title: 'Hydrant out', Category: 'Water', Body: 'Hydrant 12 out of service' })], loading: {}, fetchNotes: jest.fn(async () => undefined) });
});

afterEach(() => {
  // FlatList batches cell updates on a timer; flush it inside act before the next test.
  act(() => jest.runOnlyPendingTimers());
  jest.useRealTimers();
});

describe('NoteListScreen', () => {
  it('lists notes with plain-text previews and filters by search and category', () => {
    render(<NoteListScreen />);
    expect(screen.getByText('Note 1')).toBeTruthy();
    expect(screen.getByText('Gate code 1234')).toBeTruthy();
    fireEvent.changeText(screen.getByTestId('note-search'), 'hydrant');
    expect(screen.queryByText('Note 1')).toBeNull();
    expect(screen.getByText('Hydrant out')).toBeTruthy();
    fireEvent.changeText(screen.getByTestId('note-search'), '');
    fireEvent.press(screen.getByLabelText('Access'));
    expect(screen.queryByText('Hydrant out')).toBeNull();
  });

  it('opens a note in a sheet and renders its body only through HtmlRenderer, sanitized', () => {
    render(<NoteListScreen />);
    fireEvent.press(screen.getByTestId('note-card-1'));
    const html = String(screen.getByTestId('webview-html', hidden).props.children);
    expect(html).toContain('Gate code');
    expect(html).not.toContain('onerror');
    fireEvent.press(screen.getByTestId('note-details-close', hidden));
    expect(screen.queryByTestId('webview-html', hidden)).toBeNull();
  });

  it('shows the empty state', () => {
    useNotesStore.setState({ notes: [] });
    render(<NoteListScreen />);
    expect(screen.getByTestId('note-list-empty')).toBeTruthy();
  });
});
