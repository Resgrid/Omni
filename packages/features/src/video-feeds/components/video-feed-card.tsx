import { formatUtcInDepartmentTime } from '@resgrid/core/utils/dates';
import { useTranslation } from '@resgrid/i18n';
import { type CallVideoFeedResultData, CallVideoFeedStatus } from '@resgrid/models';
import { Button, ButtonText, Text } from '@resgrid/ui';
import { Video } from 'lucide-react-native';
import React from 'react';
import { StyleSheet, View } from 'react-native';

import { FEED_FORMAT_LABELS, FEED_STATUS_LABELS, FEED_TYPE_LABELS } from '../lib/feed-format';

export interface VideoFeedCardProps {
  feed: CallVideoFeedResultData;
  onWatch: (feed: CallVideoFeedResultData) => void;
  onCopyUrl: (feed: CallVideoFeedResultData) => void;
  /** Present only with `capabilities.videoFeeds === 'manage'` (Dispatch). */
  onEdit?: (feed: CallVideoFeedResultData) => void;
  onDelete?: (feed: CallVideoFeedResultData) => void;
}

const STATUS_COLORS: Record<number, string> = { [CallVideoFeedStatus.Active]: '#16A34A', [CallVideoFeedStatus.Inactive]: '#6B7280', [CallVideoFeedStatus.Error]: '#DC2626' };

/** A call video feed: name, type/format, status, who added it; watch and copy for everyone, edit/delete for managers. */
export const VideoFeedCard: React.FC<VideoFeedCardProps> = ({ feed, onWatch, onCopyUrl, onEdit, onDelete }) => {
  const { t } = useTranslation();
  const meta = [feed.FeedType !== null ? t(FEED_TYPE_LABELS[feed.FeedType] ?? 'video_feeds.type_other') : null, feed.FeedFormat !== null ? t(FEED_FORMAT_LABELS[feed.FeedFormat] ?? 'video_feeds.format_other') : null]
    .filter((part): part is string => !!part)
    .join(' · ');
  const status = t(FEED_STATUS_LABELS[feed.Status] ?? 'video_feeds.status_inactive');
  const added = formatUtcInDepartmentTime(feed.AddedOnUtc, null) || feed.AddedOnFormatted;
  return (
    <View style={styles.card} className="border-outline-100 bg-background-0" testID={`video-feed-card-${feed.CallVideoFeedId}`}>
      <View style={styles.header}>
        <View style={styles.icon}>
          <Video size={20} color="#2563EB" />
        </View>
        <View style={styles.titleBlock}>
          <Text className="font-semibold text-typography-900">{feed.Name}</Text>
          {meta ? (
            <Text size="xs" className="text-typography-500">
              {meta}
            </Text>
          ) : null}
        </View>
        <View style={StyleSheet.flatten([styles.status, { backgroundColor: `${STATUS_COLORS[feed.Status] ?? '#6B7280'}22` }])} accessible accessibilityLabel={status}>
          <Text size="xs" style={{ color: STATUS_COLORS[feed.Status] ?? '#6B7280' }}>
            {status}
          </Text>
        </View>
      </View>
      {feed.Description ? (
        <Text size="sm" className="mt-1 text-typography-600">
          {feed.Description}
        </Text>
      ) : null}
      {feed.FullName || added ? (
        <Text size="xs" className="mt-1 text-typography-400">
          {[feed.FullName ? `${t('video_feeds.added_by')} ${feed.FullName}` : null, added ? `${t('video_feeds.added_on')} ${added}` : null].filter(Boolean).join(' · ')}
        </Text>
      ) : null}
      <View style={styles.actions}>
        <Button size="sm" className="mr-2" onPress={() => onWatch(feed)} accessibilityLabel={`${t('video_feeds.watch')}: ${feed.Name}`} testID={`video-feed-watch-${feed.CallVideoFeedId}`}>
          <ButtonText>{t('video_feeds.watch')}</ButtonText>
        </Button>
        <Button size="sm" variant="outline" className="mr-2" onPress={() => onCopyUrl(feed)} accessibilityLabel={t('video_feeds.copy_url')} testID={`video-feed-copy-${feed.CallVideoFeedId}`}>
          <ButtonText>{t('video_feeds.copy_url')}</ButtonText>
        </Button>
        {onEdit ? (
          <Button size="sm" variant="outline" className="mr-2" onPress={() => onEdit(feed)} accessibilityLabel={t('video_feeds.edit_feed')} testID={`video-feed-edit-${feed.CallVideoFeedId}`}>
            <ButtonText>{t('common.edit')}</ButtonText>
          </Button>
        ) : null}
        {onDelete ? (
          <Button size="sm" variant="outline" action="negative" onPress={() => onDelete(feed)} accessibilityLabel={t('video_feeds.delete_feed')} testID={`video-feed-delete-${feed.CallVideoFeedId}`}>
            <ButtonText>{t('common.delete')}</ButtonText>
          </Button>
        ) : null}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: 12, padding: 12, marginBottom: 8 },
  header: { flexDirection: 'row', alignItems: 'center' },
  icon: { marginRight: 8 },
  titleBlock: { flex: 1 },
  status: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 8 },
});
