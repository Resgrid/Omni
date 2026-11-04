import './test-setup';

import { useCallsStore } from '@resgrid/data';
import { fireEvent, render, screen } from '@testing-library/react-native';
import fs from 'fs';
import path from 'path';
import React from 'react';

import { LinkedCallModal } from '../components/call-form/form-pickers';
import { callDisplayName, callDisplayText, revealedCallText } from '../lib/call-display';
import { makeCall } from './test-utils';

const LABEL = 'Protected';

describe('call display text (Advanced Data Protection)', () => {
  it('shows the value when nothing was withheld', () => {
    const call = makeCall('1', { Name: 'Structure fire', Address: '1 Main St', RedactedFields: [] });
    expect(callDisplayName(call, LABEL)).toBe('Structure fire');
    expect(callDisplayText(call, 'Address', LABEL)).toBe('1 Main St');
    expect(revealedCallText(call, 'Nature')).toBe('<p>Smoke showing</p>');
  });

  it('shows the protected label for a field the server lists as withheld, never the sentinel', () => {
    const call = makeCall('1', { Name: 'REDACTED', Nature: 'REDACTED', Address: 'REDACTED', RedactedFields: ['Calls.Name', 'calls.natureofcall', 'calls.address'] });
    expect(callDisplayName(call, LABEL)).toBe(LABEL);
    expect(callDisplayText(call, 'Nature', LABEL)).toBe(LABEL);
    expect(revealedCallText(call, 'Address')).toBeNull();
  });

  it('falls back to the sentinel when the payload carries no RedactedFields list', () => {
    expect(callDisplayName({ Name: 'REDACTED' }, LABEL)).toBe(LABEL);
    expect(revealedCallText({ Address: 'REDACTED' }, 'Address')).toBeNull();
  });

  it('trusts the list over the sentinel: a member can type "REDACTED" into a name', () => {
    expect(callDisplayName({ Name: 'REDACTED', RedactedFields: [] }, LABEL)).toBe('REDACTED');
  });

  it('keeps an empty field empty instead of calling it protected', () => {
    expect(callDisplayName({ Name: '' }, LABEL)).toBe('');
    expect(callDisplayText({ Address: null }, 'Address', LABEL)).toBe('');
    expect(revealedCallText({}, 'Nature')).toBe('');
  });
});

describe('linked call picker', () => {
  it('lists, labels and links a withheld call by its protected label', async () => {
    useCallsStore.setState({ calls: [makeCall('1', { Name: 'Structure fire' }), makeCall('2', { Name: 'REDACTED', RedactedFields: ['calls.name'] })] });
    const onSelect = jest.fn();
    await render(<LinkedCallModal isOpen onClose={jest.fn()} onSelect={onSelect} />);
    expect(screen.getByText('#C-1 Structure fire')).toBeTruthy();
    expect(screen.getByText('#C-2 data_protection.protected_value')).toBeTruthy();
    expect(screen.queryByText(/REDACTED/)).toBeNull();
    await fireEvent.press(screen.getByTestId('linked-call-2'));
    expect(onSelect).toHaveBeenCalledWith({ callId: '2', number: 'C-2', name: 'data_protection.protected_value' });
  });
});

/**
 * Source rule: a call's Name, Nature or Address is read raw only where it is not shown — search matching, the edit form
 * and the EditCall request (Core keeps a round-tripped sentinel unchanged) — or where a protected-field gate sits on the
 * same value. Everything a screen shows goes through callDisplayName / callDisplayText / revealedCallText. The counts are
 * the raw reads each listed file may hold; a new one fails here until it uses the helper or is listed with its reason.
 */
const FEATURES_SRC = path.resolve(__dirname, '..', '..');
const RAW_CALL_FIELD = /\b[A-Za-z_$]*[cC]all\??\.(Name|Nature|Address|CallName|CallAddress)\b/g;

const ALLOWED_RAW_READS = new Map(
  Object.entries({
    'calls/lib/call-form.ts': { count: 7, reason: 'the edit form starts from the stored value and checks which fields ADP withheld' },
    'calls/lib/dispatch-selection.ts': { count: 3, reason: 'the add-resources EditCall request echoes the stored value' },
    'calls/lib/call-filters.ts': { count: 3, reason: 'search matching, not display' },
    'call-queues/lib/archived-calls.ts': { count: 3, reason: 'search matching, not display' },
    'calls/components/detail/call-info-panel.tsx': { count: 2, reason: 'DetailRow shows the protected label when isProtected' },
    'awaiting-resources/components/awaiting-call-card.tsx': { count: 2, reason: 'maps CallName/Address into the display helpers' },
  } satisfies Record<string, { count: number; reason: string }>)
);

const walk = (dir: string): string[] =>
  fs
    .readdirSync(dir, { withFileTypes: true })
    .flatMap((entry) => (entry.isDirectory() ? (entry.name === '__tests__' ? [] : walk(path.join(dir, entry.name))) : /\.tsx?$/.test(entry.name) ? [path.join(dir, entry.name)] : []));

describe('call display source rule', () => {
  it('never shows a raw call name, nature or address', () => {
    const counts = walk(FEATURES_SRC)
      .map((file) => ({ file: path.relative(FEATURES_SRC, file).replace(/\\/g, '/'), count: (fs.readFileSync(file, 'utf8').match(RAW_CALL_FIELD) ?? []).length }))
      .filter(({ count }) => count > 0);

    const offenders = counts.filter(({ file, count }) => count > (ALLOWED_RAW_READS.get(file)?.count ?? 0)).map(({ file, count }) => `${file}: ${count}`);
    expect(offenders).toEqual([]);
  });
});
