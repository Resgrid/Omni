import {
  emptyRecipientSelection,
  everyoneRecipientSelection,
  matchesRecipientQuery,
  offeredRecipientSelection,
  pickedCount,
  recipientEntrySpokenLabel,
  type RecipientPickerSection,
  type RecipientPickerSelection,
  summarizeRecipientSelection,
  toggleRecipient,
} from '../lib/recipient-picker';

type Key = 'people' | 'units';

const pat = { id: 'u1', name: 'Pat Smith', detail: 'Station 1' };
const alex = { id: 'u2', name: 'Alex Kim' };

const sections: Pick<RecipientPickerSection<Key>, 'key' | 'entries'>[] = [
  { key: 'people', entries: [pat, alex] },
  {
    key: 'units',
    entries: [
      { id: '7', name: 'Engine 7' },
      { id: '8', name: 'Ladder 8' },
      { id: '9', name: 'Medic 9' },
    ],
  },
];

describe('recipient picker selection', () => {
  it('toggles picks per section, and a pick ends "everyone"', () => {
    let selection: RecipientPickerSelection<Key> = everyoneRecipientSelection<Key>();
    selection = toggleRecipient(selection, 'units', '7');
    expect(selection).toEqual({ everyone: false, ids: { units: ['7'] } });
    selection = toggleRecipient(toggleRecipient(selection, 'people', 'u1'), 'units', '7');
    expect(selection).toEqual({ everyone: false, ids: { people: ['u1'], units: [] } });
    expect(pickedCount(selection, sections)).toBe(1);
    expect(pickedCount(emptyRecipientSelection<Key>(), sections)).toBe(0);
  });

  it('drops "everyone" from a selection only where the picker does not offer it', () => {
    const picks: RecipientPickerSelection<Key> = { everyone: false, ids: { units: ['7'] } };
    expect(offeredRecipientSelection(everyoneRecipientSelection<Key>(), false)).toEqual({ everyone: false, ids: {} });
    expect(offeredRecipientSelection(everyoneRecipientSelection<Key>(), true)).toEqual({ everyone: true, ids: {} });
    expect(offeredRecipientSelection(picks, false)).toBe(picks);
  });

  it('searches the name and the second line, ignoring case', () => {
    expect(matchesRecipientQuery(pat, 'station')).toBe(true);
    expect(matchesRecipientQuery(pat, ' PAT ')).toBe(true);
    expect(matchesRecipientQuery(alex, 'station')).toBe(false);
    expect(matchesRecipientQuery(alex, '')).toBe(true);
  });

  it('summarizes in section order, three names at most, and shows an id no section lists any more', () => {
    const labels = { everyone: 'ALL', none: 'NONE' };
    expect(summarizeRecipientSelection(emptyRecipientSelection<Key>(), sections, labels)).toBe('NONE');
    expect(summarizeRecipientSelection(everyoneRecipientSelection<Key>(), sections, labels)).toBe('ALL');
    expect(summarizeRecipientSelection({ everyone: false, ids: { units: ['7', '8', '9'], people: ['u1'] } }, sections, labels)).toBe('Pat Smith, Engine 7, Ladder 8 +1');
    expect(summarizeRecipientSelection({ everyone: false, ids: { people: ['gone'] } }, sections, labels)).toBe('gone');
  });
});

describe('recipient entry spoken label', () => {
  it('says everything the row shows, in order, skipping what is empty', () => {
    expect(
      recipientEntrySpokenLabel({
        id: '7',
        name: 'Engine 7',
        badges: [{ label: 'Run card', tone: 'runCard' }],
        metric: '2.1 km · 4 min',
        detail: 'Station 1',
        chips: [{ label: 'Available', color: '#00ff00' }, { label: 'ALS' }],
        subDetail: 'Pat Smith, Alex Kim',
        note: 'Position 2 h old',
      })
    ).toBe('Engine 7, Run card, 2.1 km · 4 min, Station 1, Available, ALS, Pat Smith, Alex Kim, Position 2 h old');
    expect(recipientEntrySpokenLabel({ id: 'u2', name: 'Alex Kim', detail: null, note: '' })).toBe('Alex Kim');
  });
});
