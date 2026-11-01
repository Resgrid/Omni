import { useTranslation } from '@resgrid/i18n';
import type { CallVideoFeedResultData } from '@resgrid/models';
import { Button, ButtonText, NativeModal, Pressable, Text } from '@resgrid/ui';
import { Copy, X } from 'lucide-react-native';
import React from 'react';
import { StyleSheet, View } from 'react-native';

import { feedPlayback } from '../lib/feed-format';
import { VideoFeedSurface } from './video-feed-surface';

export interface VideoFeedPlayerProps {
  feed: CallVideoFeedResultData | null;
  isOpen: boolean;
  onClose: () => void;
  onCopyUrl: (feed: CallVideoFeedResultData) => void;
}

/** Full-screen player (Dispatch player + Unit modal) in a NativeModal so toasts (e.g. "URL copied") show above it. */
export const VideoFeedPlayer: React.FC<VideoFeedPlayerProps> = ({ feed, isOpen, onClose, onCopyUrl }) => {
  const { t } = useTranslation();
  if (!feed) return null;
  const copyOnly = feedPlayback(feed.FeedFormat, feed.Url) === 'copy-only';
  return (
    <NativeModal visible={isOpen} animationType="slide" presentationStyle="fullScreen" onRequestClose={onClose} testID="video-feed-player">
      <View style={styles.screen}>
        <View style={styles.header}>
          <Text className="flex-1 text-lg font-bold text-typography-0" numberOfLines={1} accessibilityRole="header">
            {feed.Name}
          </Text>
          <Pressable onPress={() => onCopyUrl(feed)} accessibilityRole="button" accessibilityLabel={t('video_feeds.copy_url')} className="p-2" testID="video-feed-player-copy">
            <Copy size={22} color="#FFFFFF" />
          </Pressable>
          <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel={t('common.close')} className="p-2" testID="video-feed-player-close">
            <X size={24} color="#FFFFFF" />
          </Pressable>
        </View>
        <View style={styles.body}>
          <VideoFeedSurface feed={feed} />
          {copyOnly ? (
            <Button className="mt-4" onPress={() => onCopyUrl(feed)} accessibilityLabel={t('video_feeds.copy_url')}>
              <ButtonText>{t('video_feeds.copy_url')}</ButtonText>
            </Button>
          ) : null}
        </View>
      </View>
    </NativeModal>
  );
};

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#000000' },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingTop: 48, paddingBottom: 8 },
  body: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
