import { useCallVideoFeedsStore } from '@resgrid/data';
import { useTranslation } from '@resgrid/i18n';
import type { CallVideoFeedResultData } from '@resgrid/models';
import { Button, ButtonText, CustomBottomSheet, Input, InputField, Pressable, Text, Textarea, TextareaInput, useToast } from '@resgrid/ui';
import React, { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { detectFeedFormat, FEED_FORMAT_LABELS, FEED_FORMAT_VALUES, FEED_TYPE_LABELS, FEED_TYPE_VALUES, isAcceptedFeedUrl } from '../lib/feed-format';

export interface VideoFeedFormSheetProps {
  isOpen: boolean;
  onClose: () => void;
  callId: string;
  /** Edit an existing feed; null/undefined adds one. */
  feed?: CallVideoFeedResultData | null;
}

interface FormState {
  name: string;
  url: string;
  feedType: number | null;
  feedFormat: number | null;
  description: string;
  latitude: string;
  longitude: string;
}

const fromFeed = (feed: CallVideoFeedResultData | null | undefined): FormState => ({
  name: feed?.Name ?? '',
  url: feed?.Url ?? '',
  feedType: feed?.FeedType ?? null,
  feedFormat: feed?.FeedFormat ?? null,
  description: feed?.Description ?? '',
  latitude: feed?.Latitude !== null && feed?.Latitude !== undefined ? String(feed.Latitude) : '',
  longitude: feed?.Longitude !== null && feed?.Longitude !== undefined ? String(feed.Longitude) : '',
});

const coordinate = (value: string): string | null => (value.trim() && Number.isFinite(Number(value)) ? value.trim() : null);

/** Add/edit a call video feed (Dispatch form; `videoFeeds: manage` only). Online write: a refusal keeps the form open. */
export const VideoFeedFormSheet: React.FC<VideoFeedFormSheetProps> = ({ isOpen, onClose, callId, feed }) => {
  const { t } = useTranslation();
  const toast = useToast();
  const saveFeed = useCallVideoFeedsStore((state) => state.saveFeed);
  const editFeed = useCallVideoFeedsStore((state) => state.editFeed);
  const isSaving = useCallVideoFeedsStore((state) => state.isSaving);
  const [form, setForm] = useState<FormState>(fromFeed(feed));
  const [errors, setErrors] = useState<{ name?: string; url?: string }>({});

  useEffect(() => {
    if (isOpen) {
      setForm(fromFeed(feed));
      setErrors({});
    }
  }, [feed, isOpen]);

  const update = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((current) => ({ ...current, [key]: value }));

  const onUrlChange = (url: string) => setForm((current) => ({ ...current, url, feedFormat: current.feedFormat ?? detectFeedFormat(url) }));

  const submit = async () => {
    const nextErrors: { name?: string; url?: string } = {};
    if (!form.name.trim()) nextErrors.name = t('video_feeds.name_required');
    if (!isAcceptedFeedUrl(form.url)) nextErrors.url = t('video_feeds.url_invalid');
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;
    const common = {
      CallId: callId,
      Name: form.name.trim(),
      Url: form.url.trim(),
      FeedType: form.feedType,
      FeedFormat: form.feedFormat ?? detectFeedFormat(form.url),
      Description: form.description.trim() || null,
      Latitude: coordinate(form.latitude),
      Longitude: coordinate(form.longitude),
    };
    const ok = feed ? await editFeed({ ...common, CallVideoFeedId: feed.CallVideoFeedId, Status: feed.Status, SortOrder: feed.SortOrder }) : (await saveFeed(common)) !== null;
    if (ok) {
      toast.success(t('video_feeds.save_success'));
      onClose();
    } else {
      toast.error(t('video_feeds.save_error'));
    }
  };

  const chip = (selected: boolean, label: string, onPress: () => void, testID: string) => (
    <Pressable
      key={testID}
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={label}
      testID={testID}
      className={`mb-2 mr-2 rounded-full border px-3 py-1 ${selected ? 'border-primary-600 bg-primary-100' : 'border-outline-300'}`}
    >
      <Text size="sm">{label}</Text>
    </Pressable>
  );

  return (
    <CustomBottomSheet isOpen={isOpen} onClose={onClose} isLoading={isSaving} snapPoints={[85]} testID="video-feed-form-sheet">
      <ScrollView style={styles.scroll} keyboardShouldPersistTaps="handled">
        <Text className="mb-3 text-lg font-bold text-typography-900" accessibilityRole="header">
          {feed ? t('video_feeds.edit_feed') : t('video_feeds.add_feed')}
        </Text>
        <Text size="sm" className="mb-1 text-typography-600">
          {t('video_feeds.name')}
        </Text>
        <Input variant="outline">
          <InputField value={form.name} onChangeText={(value: string) => update('name', value)} accessibilityLabel={t('video_feeds.name')} testID="video-feed-form-name" />
        </Input>
        {errors.name ? (
          <Text size="xs" className="mt-1 text-error-600">
            {errors.name}
          </Text>
        ) : null}

        <Text size="sm" className="mb-1 mt-3 text-typography-600">
          {t('video_feeds.url')}
        </Text>
        <Input variant="outline">
          <InputField value={form.url} onChangeText={onUrlChange} autoCapitalize="none" autoCorrect={false} keyboardType="url" accessibilityLabel={t('video_feeds.url')} testID="video-feed-form-url" />
        </Input>
        {errors.url ? (
          <Text size="xs" className="mt-1 text-error-600">
            {errors.url}
          </Text>
        ) : null}

        <Text size="sm" className="mb-1 mt-3 text-typography-600">
          {t('video_feeds.feed_type')}
        </Text>
        <View style={styles.chips} accessibilityRole="radiogroup" accessibilityLabel={t('video_feeds.feed_type')}>
          {FEED_TYPE_VALUES.map((value) => chip(form.feedType === value, t(FEED_TYPE_LABELS[value]), () => update('feedType', value), `video-feed-form-type-${value}`))}
        </View>

        <Text size="sm" className="mb-1 mt-3 text-typography-600">
          {t('video_feeds.feed_format')}
        </Text>
        <View style={styles.chips} accessibilityRole="radiogroup" accessibilityLabel={t('video_feeds.feed_format')}>
          {FEED_FORMAT_VALUES.map((value) => chip(form.feedFormat === value, t(FEED_FORMAT_LABELS[value]), () => update('feedFormat', value), `video-feed-form-format-${value}`))}
        </View>

        <Text size="sm" className="mb-1 mt-3 text-typography-600">
          {t('video_feeds.description')}
        </Text>
        <Textarea>
          <TextareaInput value={form.description} onChangeText={(value: string) => update('description', value)} accessibilityLabel={t('video_feeds.description')} />
        </Textarea>

        <View style={styles.row}>
          <View style={styles.half}>
            <Text size="sm" className="mb-1 mt-3 text-typography-600">
              {t('video_feeds.latitude')}
            </Text>
            <Input variant="outline">
              <InputField value={form.latitude} onChangeText={(value: string) => update('latitude', value)} keyboardType="numbers-and-punctuation" accessibilityLabel={t('video_feeds.latitude')} />
            </Input>
          </View>
          <View style={styles.half}>
            <Text size="sm" className="mb-1 mt-3 text-typography-600">
              {t('video_feeds.longitude')}
            </Text>
            <Input variant="outline">
              <InputField value={form.longitude} onChangeText={(value: string) => update('longitude', value)} keyboardType="numbers-and-punctuation" accessibilityLabel={t('video_feeds.longitude')} />
            </Input>
          </View>
        </View>

        <View style={styles.footer}>
          <Button variant="outline" className="mr-2 flex-1" onPress={onClose} accessibilityLabel={t('common.cancel')}>
            <ButtonText>{t('common.cancel')}</ButtonText>
          </Button>
          <Button className="flex-1" onPress={() => void submit()} isDisabled={isSaving} accessibilityLabel={t('common.save')} testID="video-feed-form-save">
            <ButtonText>{t('common.save')}</ButtonText>
          </Button>
        </View>
      </ScrollView>
    </CustomBottomSheet>
  );
};

const styles = StyleSheet.create({
  scroll: { width: '100%' },
  chips: { flexDirection: 'row', flexWrap: 'wrap' },
  row: { flexDirection: 'row' },
  half: { flex: 1, marginRight: 8 },
  footer: { flexDirection: 'row', marginTop: 16, marginBottom: 8 },
});
