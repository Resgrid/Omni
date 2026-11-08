import './test-setup';

import { useCallDetailStore, useCallsStore, useCallVideoFeedsStore } from '@resgrid/data';
import { CallExtraDataResultData, CallProtocolsResultData, type CallResultData } from '@resgrid/models';
import { fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';

import { CallSummaryModal } from '../components/call-summary-modal';
import { activateVariant, hidden, makeCall, setRights } from './test-utils';

const extraData = (overrides: Partial<CallExtraDataResultData> = {}): CallExtraDataResultData => Object.assign(new CallExtraDataResultData(), overrides);

const STRUCTURE_FIRE = Object.assign(new CallProtocolsResultData(), { Id: '1', Code: 'P1', Name: 'Structure fire', ProtocolText: '<p>Do this</p>' });

const setDetail = (call: CallResultData, extra: CallExtraDataResultData | null = extraData()) =>
  useCallDetailStore.setState((state) => ({ details: { ...state.details, [call.CallId]: { call, extraData: extra, notes: [], images: null, files: null, audio: null, fetchedAt: 1 } } }));

const tabKeys = () =>
  screen
    .getAllByTestId(/^shared-tab-[a-z-]+$/, hidden)
    .map((tab) => String(tab.props.testID).replace('shared-tab-', ''))
    .filter((key) => !/-(label|badge)$/.test(key));

const renderModal = async (props: { onClose?: () => void; onOpenDetails?: (callId: string) => void } = {}) => {
  const onClose = props.onClose ?? jest.fn();
  const onOpenDetails = props.onOpenDetails ?? jest.fn();
  await render(<CallSummaryModal isOpen onClose={onClose} callId="10" onOpenDetails={onOpenDetails} />);

  return { onClose, onOpenDetails };
};

beforeEach(() => {
  setRights({});
  useCallsStore.setState({ calls: [], queuedCalls: {}, callPriorities: [{ Id: 1, DepartmentId: 0, Name: 'High', Color: '#dc2626', Sort: 0, IsDeleted: false, IsDefault: false, Tone: 0 }] });
  useCallDetailStore.setState({
    details: {},
    queuedNotes: {},
    queuedFiles: {},
    loading: {},
    errors: {},
    fetchCallDetail: jest.fn(async () => undefined),
    fetchCallNotes: jest.fn(async () => undefined),
    fetchCallImages: jest.fn(async () => undefined),
    fetchCallFiles: jest.fn(async () => undefined),
    fetchCallAudio: jest.fn(async () => undefined),
    fetchCallSiteInfo: jest.fn(async () => undefined),
    fetchCallLocationHistory: jest.fn(async () => undefined),
  });
  useCallVideoFeedsStore.setState({ feedsByCall: {}, fetchFeeds: jest.fn(async () => undefined) });
});

describe('CallSummaryModal', () => {
  it('shows the call’s title, priority, address and nature (sanitized), and loads its detail on open', async () => {
    activateVariant('unit');
    setDetail(makeCall('10', { Name: 'House fire', Nature: '<p>Flames visible</p><script>alert(1)</script>', Address: '1 Main St' }));
    await renderModal();

    expect(screen.getByText('House fire (#C-10)', hidden)).toBeTruthy();
    expect(screen.getByTestId('call-summary-modal-priority', hidden)).toHaveTextContent('High');
    expect(screen.getByTestId('call-summary-modal-address', hidden)).toHaveTextContent('1 Main St');
    const html = String(screen.getByTestId('webview-html', hidden).props.children);
    expect(html).toContain('Flames visible');
    expect(html).not.toContain('<script');
    expect(useCallDetailStore.getState().fetchCallDetail).toHaveBeenCalledWith('10');
  });

  it('shows the open-calls row until the detail has loaded', async () => {
    activateVariant('unit');
    useCallsStore.setState({ calls: [makeCall('10', { Name: 'Medical aid' })] });
    await renderModal();

    expect(screen.getByText('Medical aid (#C-10)', hidden)).toBeTruthy();
    expect(screen.getByTestId('call-summary-modal-summary', hidden)).toBeTruthy();
  });

  it('offers notes, images, files, video, protocols, site info, history and audio, with their counts, opening on notes', async () => {
    activateVariant('unit');
    setDetail(makeCall('10', { NotesCount: 3, ImgagesCount: 2, FileCount: 1, AudioCount: 4 }), extraData({ Protocols: [STRUCTURE_FIRE] }));
    await renderModal();

    expect(tabKeys()).toEqual(['notes', 'images', 'files', 'video', 'protocols', 'site-info', 'history', 'audio']);
    expect(screen.getByTestId('shared-tab-notes', hidden).props.accessibilityState).toEqual(expect.objectContaining({ selected: true }));
    expect(useCallDetailStore.getState().fetchCallNotes).toHaveBeenCalledWith('10');
    expect(screen.getByText('3', hidden)).toBeTruthy();
    expect(screen.getByText('4', hidden)).toBeTruthy();
  });

  it('leaves out video where the app has no video feeds and site info when nothing is linked to the call', async () => {
    activateVariant('bigboard');
    setDetail(makeCall('10', { Contacts: [] }));
    await renderModal();

    expect(tabKeys()).toEqual(['notes', 'images', 'files', 'protocols', 'history', 'audio']);
  });

  it('mounts only the open tab: the audio recordings load on the Audio tab and stop when the crew leaves it', async () => {
    activateVariant('unit');
    setDetail(makeCall('10'));
    await renderModal();

    expect(screen.queryByTestId('call-audio-panel', hidden)).toBeNull();
    await fireEvent.press(screen.getByTestId('shared-tab-audio', hidden));
    expect(screen.getByTestId('call-audio-panel', hidden)).toBeTruthy();
    expect(useCallDetailStore.getState().fetchCallAudio).toHaveBeenCalledWith('10');

    await fireEvent.press(screen.getByTestId('shared-tab-images', hidden));
    expect(screen.queryByTestId('call-audio-panel', hidden)).toBeNull();
    expect(screen.getByTestId('call-images-panel', hidden)).toBeTruthy();
    expect(useCallDetailStore.getState().fetchCallImages).toHaveBeenCalledWith('10');
  });

  it('shows the call’s protocols', async () => {
    activateVariant('unit');
    setDetail(makeCall('10'), extraData({ Protocols: [STRUCTURE_FIRE] }));
    await renderModal();

    await fireEvent.press(screen.getByTestId('shared-tab-protocols', hidden));
    expect(screen.getByTestId('call-protocols-panel', hidden)).toBeTruthy();
    expect(screen.getByText(/Structure fire/, hidden)).toBeTruthy();
  });

  it('closes and opens the full call detail from "View call details"', async () => {
    activateVariant('unit');
    setDetail(makeCall('10'));
    const { onClose, onOpenDetails } = await renderModal();

    await fireEvent.press(screen.getByTestId('call-summary-modal-details', hidden));
    expect(onClose).toHaveBeenCalled();
    expect(onOpenDetails).toHaveBeenCalledWith('10');
  });
});
