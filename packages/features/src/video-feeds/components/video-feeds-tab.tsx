import { useCapability } from '@resgrid/config';
import { useCallVideoFeedsStore } from '@resgrid/data';
import { useTranslation } from '@resgrid/i18n';
import type { CallVideoFeedResultData } from '@resgrid/models';
import { Button, ButtonText, CustomBottomSheet, Loading, Text, useToast } from '@resgrid/ui';
import * as Clipboard from 'expo-clipboard';
import React, { useCallback, useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { VideoFeedCard } from './video-feed-card';
import { VideoFeedFormSheet } from './video-feed-form-sheet';
import { VideoFeedPlayer } from './video-feed-player';

export interface VideoFeedsTabProps {
  callId: string;
  /** Overrides the variant capability (`videoFeeds === 'manage'`, Dispatch). */
  canManage?: boolean;
}

const EMPTY: CallVideoFeedResultData[] = [];

/** Video feeds on a call (omni-plan §7.10: Dispatch form/player + Unit format utils). Everyone with `view` watches; `manage` adds, edits and deletes. */
export const VideoFeedsTab: React.FC<VideoFeedsTabProps> = ({ callId, canManage }) => {
  const { t } = useTranslation();
  const toast = useToast();
  const capability = useCapability('videoFeeds');
  const manage = canManage ?? capability === 'manage';
  const feeds = useCallVideoFeedsStore((state) => state.feedsByCall[callId] ?? EMPTY);
  const isLoading = useCallVideoFeedsStore((state) => state.loading.feeds === true);
  const fetchFeeds = useCallVideoFeedsStore((state) => state.fetchFeeds);
  const deleteFeed = useCallVideoFeedsStore((state) => state.deleteFeed);
  const [playing, setPlaying] = useState<CallVideoFeedResultData | null>(null);
  const [editing, setEditing] = useState<CallVideoFeedResultData | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [deleting, setDeleting] = useState<CallVideoFeedResultData | null>(null);

  useEffect(() => {
    void fetchFeeds(callId);
  }, [callId, fetchFeeds]);

  const copyUrl = useCallback(
    async (feed: CallVideoFeedResultData) => {
      try {
        await Clipboard.setStringAsync(feed.Url);
        toast.success(t('video_feeds.url_copied'));
      } catch {
        toast.error(t('common.something_went_wrong'));
      }
    },
    [t, toast]
  );

  const confirmDelete = async () => {
    if (!deleting) return;
    const feed = deleting;
    setDeleting(null);
    const ok = await deleteFeed(feed.CallVideoFeedId, callId);
    if (ok) toast.success(t('video_feeds.delete_success'));
    else toast.error(t('video_feeds.delete_error'));
  };

  return (
    <View style={styles.panel} testID="video-feeds-tab">
      {manage ? (
        <Button
          size="sm"
          className="mb-3 self-start"
          onPress={() => {
            setEditing(null);
            setIsFormOpen(true);
          }}
          accessibilityLabel={t('video_feeds.add_feed')}
          testID="video-feeds-add"
        >
          <ButtonText>{t('video_feeds.add_feed')}</ButtonText>
        </Button>
      ) : null}

      {isLoading && feeds.length === 0 ? (
        <Loading text={t('video_feeds.loading')} />
      ) : feeds.length === 0 ? (
        <Text className="text-typography-600">{t('video_feeds.no_feeds')}</Text>
      ) : (
        feeds.map((feed) => (
          <VideoFeedCard
            key={feed.CallVideoFeedId}
            feed={feed}
            onWatch={setPlaying}
            onCopyUrl={(value) => void copyUrl(value)}
            onEdit={
              manage
                ? (value) => {
                    setEditing(value);
                    setIsFormOpen(true);
                  }
                : undefined
            }
            onDelete={manage ? setDeleting : undefined}
          />
        ))
      )}

      <VideoFeedPlayer feed={playing} isOpen={playing !== null} onClose={() => setPlaying(null)} onCopyUrl={(value) => void copyUrl(value)} />
      {manage ? <VideoFeedFormSheet isOpen={isFormOpen} onClose={() => setIsFormOpen(false)} callId={callId} feed={editing} /> : null}
      {manage ? (
        <CustomBottomSheet isOpen={deleting !== null} onClose={() => setDeleting(null)} snapPoints={[35]} testID="video-feed-delete-confirm">
          <Text className="text-lg font-bold text-typography-900" accessibilityRole="header">
            {t('video_feeds.delete_confirm_title')}
          </Text>
          <Text className="mt-2 text-typography-700">{t('video_feeds.delete_confirm_message')}</Text>
          <View style={styles.confirmActions}>
            <Button variant="outline" className="mr-2 flex-1" onPress={() => setDeleting(null)} accessibilityLabel={t('common.cancel')}>
              <ButtonText>{t('common.cancel')}</ButtonText>
            </Button>
            <Button action="negative" className="flex-1" onPress={() => void confirmDelete()} accessibilityLabel={t('video_feeds.delete_feed')} testID="video-feed-delete-confirm-button">
              <ButtonText>{t('video_feeds.delete_feed')}</ButtonText>
            </Button>
          </View>
        </CustomBottomSheet>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  panel: { padding: 16 },
  confirmActions: { flexDirection: 'row', marginTop: 16 },
});
