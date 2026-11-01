import { fireEvent, render } from '@testing-library/react-native';
import React from 'react';

import { DateTimeField } from '../date-time-field';

it('selects a leap day using the calendar and commits only on Done', async () => {
  const onChange = jest.fn();
  const screen = await render(<DateTimeField value="2024-02-01" label="Issued on" onChange={onChange} testID="date" />);
  expect(screen.container.queryAll((node) => node.type === 'TextInput')).toHaveLength(0);
  await fireEvent.press(screen.getByTestId('date'));
  expect(screen.queryByTestId('date-day-30')).toBeNull();
  await fireEvent.press(screen.getByTestId('date-day-29'));
  expect(onChange).not.toHaveBeenCalled();
  await fireEvent.press(screen.getByTestId('date-done'));
  expect(onChange).toHaveBeenCalledWith('2024-02-29');
  await screen.unmount();
});

it('changes month and year without rolling an end-of-month value into another month', async () => {
  const onChange = jest.fn();
  const screen = await render(<DateTimeField value="2024-01-31" label="Expires on" onChange={onChange} testID="date" />);
  await fireEvent.press(screen.getByTestId('date'));
  await fireEvent.press(screen.getByTestId('date-year'));
  await fireEvent.press(screen.getByTestId('date-year-2025'));
  await fireEvent.press(screen.getByTestId('date-month'));
  await fireEvent.press(screen.getByTestId('date-month-1'));
  expect(screen.queryByTestId('date-day-29')).toBeNull();
  await fireEvent.press(screen.getByTestId('date-day-28'));
  await fireEvent.press(screen.getByTestId('date-done'));
  expect(onChange).toHaveBeenCalledWith('2025-02-28');
  await screen.unmount();
});

it('keeps the selection in the month and year on screen when Done is pressed without picking a day', async () => {
  const onChange = jest.fn();
  const screen = await render(<DateTimeField value="2024-01-31" label="Expires on" onChange={onChange} testID="date" />);
  await fireEvent.press(screen.getByTestId('date'));
  await fireEvent.press(screen.getByTestId('date-next'));
  expect(screen.getByTestId('date-day-29').props.accessibilityState).toMatchObject({ selected: true });
  await fireEvent.press(screen.getByTestId('date-done'));
  expect(onChange).toHaveBeenLastCalledWith('2024-02-29');

  await fireEvent.press(screen.getByTestId('date'));
  await fireEvent.press(screen.getByTestId('date-year'));
  await fireEvent.press(screen.getByTestId('date-year-2025'));
  await fireEvent.press(screen.getByTestId('date-month'));
  await fireEvent.press(screen.getByTestId('date-month-5'));
  await fireEvent.press(screen.getByTestId('date-done'));
  expect(onChange).toHaveBeenLastCalledWith('2025-06-30');
  await screen.unmount();
});

it('keeps the time of day when moving a date and time to another month', async () => {
  const onChange = jest.fn();
  const value = new Date(2026, 0, 31, 21, 15).toISOString();
  const screen = await render(<DateTimeField mode="datetime" value={value} label="Date and time" onChange={onChange} testID="date" />);
  await fireEvent.press(screen.getByTestId('date'));
  await fireEvent.press(screen.getByTestId('date-previous'));
  await fireEvent.press(screen.getByTestId('date-done'));
  expect(onChange).toHaveBeenCalledWith(new Date(2025, 11, 31, 21, 15).toISOString());
  await screen.unmount();
});

it('cancels without changing the value, supports clearing, and prevents disabled edits', async () => {
  const onChange = jest.fn();
  const screen = await render(<DateTimeField value="2026-09-26" label="Date" onChange={onChange} testID="date" />);
  await fireEvent.press(screen.getByTestId('date'));
  await fireEvent.press(screen.getByTestId('date-day-15'));
  await fireEvent.press(screen.getByTestId('date-cancel'));
  expect(onChange).not.toHaveBeenCalled();
  await fireEvent.press(screen.getByTestId('date'));
  await fireEvent.press(screen.getByTestId('date-clear'));
  expect(onChange).toHaveBeenCalledWith('');
  await screen.rerender(<DateTimeField value="2026-09-26" label="Date" onChange={onChange} testID="date" disabled />);
  await fireEvent.press(screen.getByTestId('date'));
  expect(screen.queryByTestId('date-done')).toBeNull();
  await screen.unmount();
});

it('picks clock hours and minutes without a keyboard or clearing a required time', async () => {
  const onChange = jest.fn();
  const screen = await render(<DateTimeField mode="time" value="08:00" label="End" onChange={onChange} testID="time" clearable={false} />);
  await fireEvent.press(screen.getByTestId('time'));
  expect(screen.container.queryAll((node) => node.type === 'TextInput')).toHaveLength(0);
  expect(screen.queryByTestId('time-clear')).toBeNull();
  await fireEvent.press(screen.getByTestId('time-hour-23'));
  await fireEvent.press(screen.getByTestId('time-minute-59'));
  await fireEvent.press(screen.getByTestId('time-done'));
  expect(onChange).toHaveBeenCalledWith('23:59');
  await screen.unmount();
});

it('preserves a record timestamp when confirming its date and time without changes', async () => {
  const onChange = jest.fn();
  const screen = await render(<DateTimeField mode="datetime" value="2026-09-26T21:15:00.000Z" label="Date and time" onChange={onChange} testID="date" />);
  await fireEvent.press(screen.getByTestId('date'));
  await fireEvent.press(screen.getByTestId('date-done'));
  expect(onChange).toHaveBeenCalledWith('2026-09-26T21:15:00.000Z');
  await screen.unmount();
});
