import '../../calls/__tests__/test-setup';

import { useNotesStore } from '@resgrid/data';
import type { NoteResultData } from '@resgrid/models';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { router, useLocalSearchParams } from 'expo-router';
import React from 'react';

import { hidden } from '../../calls/__tests__/test-utils';
import NoteDetailScreen from '../screens/note-detail';
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

const mockFetchNotes = jest.fn(async () => undefined);

beforeEach(() => {
  jest.useFakeTimers();
  mockFetchNotes.mockClear();
  jest.mocked(router.push).mockClear();
  jest.mocked(router.back).mockClear();
  jest.mocked(router.replace).mockClear();
  jest.mocked(useLocalSearchParams).mockReturnValue({});
  useNotesStore.setState({ notes: [note('1'), note('2', { Title: 'Hydrant out', Category: 'Water', Body: 'Hydrant 12 out of service' })], loading: {}, fetchNotes: mockFetchNotes });
});

afterEach(async () => {
  // FlatList batches cell updates on a timer; flush it inside act before the next test.
  await act(() => jest.runOnlyPendingTimers());
  jest.useRealTimers();
});

describe('NoteListScreen', () => {
  it('lists notes with plain-text previews and filters by search and category', async () => {
    await render(<NoteListScreen />);
    expect(screen.getByText('Note 1')).toBeTruthy();
    expect(screen.getByText('Gate code 1234')).toBeTruthy();
    await fireEvent.changeText(screen.getByTestId('note-search'), 'hydrant');
    expect(screen.queryByText('Note 1')).toBeNull();
    expect(screen.getByText('Hydrant out')).toBeTruthy();
    await fireEvent.changeText(screen.getByTestId('note-search'), '');
    await fireEvent.press(screen.getByLabelText('Access'));
    expect(screen.queryByText('Hydrant out')).toBeNull();
    await fireEvent.press(screen.getByLabelText('Water'));
    expect(screen.queryByText('Note 1')).toBeNull();
    await fireEvent.press(screen.getByLabelText('notes.all_categories'));
    expect(screen.getByText('Note 1')).toBeTruthy();
    expect(screen.getByText('Hydrant out')).toBeTruthy();
  });

  it('opens a note as its own page instead of a sheet', async () => {
    await render(<NoteListScreen />);
    await fireEvent.press(screen.getByTestId('note-card-2'));
    expect(router.push).toHaveBeenCalledWith('/notes/2');
    expect(screen.queryByTestId('webview-html', hidden)).toBeNull();
  });

  it('shows the empty state', async () => {
    useNotesStore.setState({ notes: [] });
    await render(<NoteListScreen />);
    expect(screen.getByTestId('note-list-empty')).toBeTruthy();
  });
});

describe('NoteDetailScreen', () => {
  it('renders the note body only through HtmlRenderer, sanitized, with its tags and dates', async () => {
    useNotesStore.setState({ notes: [note('1', { ExpiresOn: '2026-12-01T10:00:00Z' })] });
    await render(<NoteDetailScreen noteId="1" />);
    expect(screen.getAllByText('Note 1').length).toBeGreaterThan(0);
    expect(screen.getByText('notes.details.tags: Access')).toBeTruthy();
    const html = String(screen.getByTestId('webview-html', hidden).props.children);
    expect(html).toContain('Gate code');
    expect(html).not.toContain('onerror');
    // The body fits its text (autoHeight) instead of a fixed box; the page scrolls the rest.
    expect(screen.getByTestId('note-detail-html', hidden).props.onMessage).toEqual(expect.any(Function));
    expect(screen.getByText(/^notes\.details\.created: /)).toBeTruthy();
    expect(screen.getByText(/^notes\.details\.expires: /)).toBeTruthy();
    expect(mockFetchNotes).not.toHaveBeenCalled();
  });

  it('reads the note id from the route', async () => {
    jest.mocked(useLocalSearchParams).mockReturnValue({ id: '2' });
    await render(<NoteDetailScreen />);
    expect(screen.getAllByText('Hydrant out').length).toBeGreaterThan(0);
  });

  it('goes back, or to the notes list when there is no history', async () => {
    await render(<NoteDetailScreen noteId="1" />);
    await fireEvent.press(screen.getByTestId('back-button'));
    expect(router.back).toHaveBeenCalledTimes(1);
    jest.mocked(router.canGoBack).mockReturnValueOnce(false);
    await fireEvent.press(screen.getByTestId('back-button'));
    expect(router.replace).toHaveBeenCalledWith('/notes');
  });

  it('loads the notes when the note is not on the device yet, then says it was not found', async () => {
    await render(<NoteDetailScreen noteId="9" />);
    expect(mockFetchNotes).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('note-detail-missing')).toBeTruthy();
    await act(() => useNotesStore.setState({ notes: [note('9', { Title: 'Late note' })] }));
    expect(screen.getAllByText('Late note').length).toBeGreaterThan(0);
  });

  it('rejects an unsafe route id', async () => {
    jest.mocked(useLocalSearchParams).mockReturnValue({ id: '../settings' });
    await render(<NoteDetailScreen />);
    expect(screen.getByTestId('note-detail-missing')).toBeTruthy();
    expect(mockFetchNotes).not.toHaveBeenCalled();
  });
});
