import { isInboxItemSelected, runInBatches, selectAllInboxItems, selectedInboxIds, toggleInboxSelection } from '../lib/inbox-selection';

const items = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];

describe('inbox selection', () => {
  it('select all stands for every row, the loaded ones listed', () => {
    const all = selectAllInboxItems(items);

    expect(all).toEqual({ ids: ['a', 'b', 'c'], all: true });
    expect(selectedInboxIds(all, [...items, { id: 'd' }])).toEqual(['a', 'b', 'c', 'd']);
    expect(isInboxItemSelected(all, 'z')).toBe(true);
  });

  it('toggling leaves select all for the rest of the loaded rows', () => {
    expect(toggleInboxSelection(selectAllInboxItems(items), 'b', items)).toEqual({ ids: ['a', 'c'], all: false });
    expect(toggleInboxSelection({ ids: ['a'], all: false }, 'c', items)).toEqual({ ids: ['a', 'c'], all: false });
  });

  it('keeps only loaded rows in the loaded order', () => {
    expect(selectedInboxIds({ ids: ['c', 'gone', 'a'], all: false }, items)).toEqual(['a', 'c']);
  });

  it('runs a few at a time and reports each outcome, a throw as a failure', async () => {
    let running = 0;
    let peak = 0;

    const task = async (id: string) => {
      running += 1;
      peak = Math.max(peak, running);
      await Promise.resolve();
      running -= 1;

      if (id === 'x') throw new Error('nope');

      return id !== 'f';
    };

    await expect(runInBatches(['a', 'b', 'x', 'd', 'f', 'g'], task, 2)).resolves.toEqual([true, true, false, true, false, true]);
    expect(peak).toBe(2);
  });
});
