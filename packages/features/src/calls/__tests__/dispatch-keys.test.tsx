import './test-setup';

import { DispatchedEventResultData } from '@resgrid/models';
import { render, screen } from '@testing-library/react-native';
import React from 'react';

import { DispatchTicker } from '../components/dispatch-ticker';
import { dispatchKey, getUniqueDispatches } from '../lib/call-dispatch';

const dispatch = (overrides: Partial<DispatchedEventResultData>): DispatchedEventResultData => Object.assign(new DispatchedEventResultData(), overrides);

// Core's dispatch ids are per type: a call sent to person 7, unit 7 and group 7 names three entities.
const SHARED_ID = [dispatch({ Id: '7', Type: 'User', Name: 'Pat Doe' }), dispatch({ Id: '7', Type: 'Unit', Name: 'Engine 7' }), dispatch({ Id: '7', Type: 'Groups', Name: 'Station 7' })];

describe('dispatch keys', () => {
  it('tells apart entities of different types that share an id, and keys a dispatch without an id by its name', () => {
    expect(getUniqueDispatches([...SHARED_ID, dispatch({ Type: 'Role', Name: 'Driver' })]).map(dispatchKey)).toEqual(['id:user:7', 'id:unit:7', 'id:groups:7', 'name:role:driver']);
  });

  it('renders the ticker of a call dispatched to entities sharing an id without duplicate React keys', async () => {
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);

    await render(<DispatchTicker dispatches={SHARED_ID} animate={false} />);

    expect(screen.getByLabelText('P Pat Doe')).toBeOnTheScreen();
    expect(screen.getByLabelText('U Engine 7')).toBeOnTheScreen();
    expect(screen.getByLabelText('G Station 7')).toBeOnTheScreen();
    expect(consoleError.mock.calls.map((args) => args.map(String).join(' ')).filter((message) => message.includes('same key'))).toEqual([]);
    consoleError.mockRestore();
  });
});
