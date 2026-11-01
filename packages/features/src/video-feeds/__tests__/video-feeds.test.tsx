import '../../calls/__tests__/test-setup';

import { useCallVideoFeedsStore } from '@resgrid/data';
import { CallVideoFeedFormat, type CallVideoFeedResultData } from '@resgrid/models';
import { useToastStore } from '@resgrid/ui';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import * as Clipboard from 'expo-clipboard';
import React from 'react';

import { activateVariant, hidden } from '../../calls/__tests__/test-utils';
import { VideoFeedPlayer } from '../components/video-feed-player';
import { VideoFeedsTab } from '../components/video-feeds-tab';
import { detectFeedFormat, feedPlayback, isAcceptedFeedUrl } from '../lib/feed-format';

jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn(async () => true) }));
jest.mock('expo-video', () => {
  const mockRN = jest.requireActual('react-native');
  return { useVideoPlayer: jest.fn(() => ({ play: jest.fn() })), VideoView: mockRN.View };
});

const feed = (overrides: Partial<CallVideoFeedResultData> = {}): CallVideoFeedResultData => ({
  CallVideoFeedId: 'f1',
  CallId: '10',
  Name: 'Drone 1',
  Url: 'https://cams.example.org/live.m3u8',
  FeedType: 0,
  FeedFormat: CallVideoFeedFormat.HLS,
  Description: 'North side',
  Status: 0,
  Latitude: null,
  Longitude: null,
  AddedByUserId: 'u1',
  AddedOnFormatted: '',
  AddedOnUtc: '2026-10-31T11:00:00Z',
  SortOrder: 0,
  FullName: 'Pat Smith',
  ...overrides,
});

const mockSaveFeed = jest.fn();
const mockDeleteFeed = jest.fn();
const lastToast = () => useToastStore.getState().toasts.at(-1);

beforeEach(() => {
  useToastStore.getState().clearToasts();
  mockSaveFeed.mockResolvedValue('f2');
  mockDeleteFeed.mockResolvedValue(true);
  useCallVideoFeedsStore.setState({
    feedsByCall: { '10': [feed()] },
    loading: {},
    isSaving: false,
    fetchFeeds: jest.fn(async () => undefined),
    saveFeed: mockSaveFeed,
    editFeed: jest.fn(async () => true),
    deleteFeed: mockDeleteFeed,
  });
});

afterEach(() => useToastStore.getState().clearToasts());

describe('feed format utils', () => {
  it('detects formats and decides playback (http(s) only in web surfaces, RTSP copy-only)', () => {
    expect(detectFeedFormat('https://x/live.m3u8')).toBe(CallVideoFeedFormat.HLS);
    expect(detectFeedFormat('rtsp://cam/1')).toBe(CallVideoFeedFormat.RTSP);
    expect(detectFeedFormat('https://youtu.be/abc')).toBe(CallVideoFeedFormat.YouTubeLive);
    expect(detectFeedFormat('https://x/page')).toBeNull();
    expect(feedPlayback(CallVideoFeedFormat.RTSP, 'rtsp://cam/1')).toBe('copy-only');
    expect(feedPlayback(CallVideoFeedFormat.Embed, 'javascript:alert(1)')).toBe('unsupported');
    expect(feedPlayback(CallVideoFeedFormat.WebRTC, 'https://x')).toBe('unsupported');
    expect(isAcceptedFeedUrl('ftp://x')).toBe(false);
  });
});

describe('VideoFeedsTab', () => {
  it('view: everyone watches and copies; no add, edit or delete', async () => {
    activateVariant('responder');
    render(<VideoFeedsTab callId="10" />);
    expect(screen.getByText('Drone 1')).toBeTruthy();
    expect(screen.queryByTestId('video-feeds-add')).toBeNull();
    expect(screen.queryByTestId('video-feed-edit-f1')).toBeNull();
    expect(screen.queryByTestId('video-feed-delete-f1')).toBeNull();
    await act(async () => fireEvent.press(screen.getByTestId('video-feed-copy-f1')));
    expect(Clipboard.setStringAsync).toHaveBeenCalledWith('https://cams.example.org/live.m3u8');
    expect(lastToast()?.message).toBe('video_feeds.url_copied');
  });

  it('manage (Dispatch): add with validation, and delete after confirmation', async () => {
    activateVariant('dispatch');
    render(<VideoFeedsTab callId="10" />);
    fireEvent.press(screen.getByTestId('video-feeds-add'));
    await act(async () => fireEvent.press(screen.getByTestId('video-feed-form-save', hidden)));
    expect(mockSaveFeed).not.toHaveBeenCalled();
    expect(screen.getByText('video_feeds.name_required', hidden)).toBeTruthy();
    fireEvent.changeText(screen.getByTestId('video-feed-form-name', hidden), 'Traffic cam');
    fireEvent.changeText(screen.getByTestId('video-feed-form-url', hidden), 'https://cams.example.org/stream.mpd');
    await act(async () => fireEvent.press(screen.getByTestId('video-feed-form-save', hidden)));
    expect(mockSaveFeed).toHaveBeenCalledWith(expect.objectContaining({ CallId: '10', Name: 'Traffic cam', Url: 'https://cams.example.org/stream.mpd', FeedFormat: CallVideoFeedFormat.DASH }));

    fireEvent.press(screen.getByTestId('video-feed-delete-f1'));
    await act(async () => fireEvent.press(screen.getByTestId('video-feed-delete-confirm-button', hidden)));
    expect(mockDeleteFeed).toHaveBeenCalledWith('f1', '10');
  });

  it('BigBoard (videoFeeds none) can still render the tab read-only when embedded, without manage actions', () => {
    activateVariant('bigboard');
    render(<VideoFeedsTab callId="10" />);
    expect(screen.queryByTestId('video-feeds-add')).toBeNull();
  });
});

describe('VideoFeedPlayer', () => {
  it('plays HLS in expo-video only where the variant links the video module, else in a page view', () => {
    activateVariant('unit');
    const { unmount } = render(<VideoFeedPlayer feed={feed()} isOpen onClose={jest.fn()} onCopyUrl={jest.fn()} />);
    expect(screen.getByTestId('video-feed-native-player', hidden)).toBeTruthy();
    unmount();
    activateVariant('dispatch');
    render(<VideoFeedPlayer feed={feed()} isOpen onClose={jest.fn()} onCopyUrl={jest.fn()} />);
    expect(screen.queryByTestId('video-feed-native-player', hidden)).toBeNull();
    expect(screen.getByTestId('video-feed-webview', hidden)).toBeTruthy();
  });

  it('offers only "Copy URL" for RTSP', () => {
    activateVariant('unit');
    const onCopyUrl = jest.fn();
    render(<VideoFeedPlayer feed={feed({ Url: 'rtsp://cam/1', FeedFormat: CallVideoFeedFormat.RTSP })} isOpen onClose={jest.fn()} onCopyUrl={onCopyUrl} />);
    expect(screen.getByText('video_feeds.rtsp_not_supported', hidden)).toBeTruthy();
    expect(screen.queryByTestId('video-feed-webview', hidden)).toBeNull();
    fireEvent.press(screen.getByTestId('video-feed-player-copy', hidden));
    expect(onCopyUrl).toHaveBeenCalled();
  });
});
