import { useTranslation } from '@resgrid/i18n';
import { type GifResultData } from '@resgrid/models';
import { CustomBottomSheet, HStack, Image, Input, InputField, Pressable, Spinner, Text, View, VStack } from '@resgrid/ui';
import React, { useCallback, useEffect, useRef, useState } from 'react';

import { searchGifs } from '../lib/chat-actions';
import { isHttpsUrl } from '../lib/chat-format';

export interface GifPickerSheetProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (gif: GifResultData) => void;
}

const SEARCH_DEBOUNCE_MS = 400;

/** GIF search (Responder sheet): trending on open, debounced search through Core's configured provider, tap to send. Online only. */
export const GifPickerSheet: React.FC<GifPickerSheetProps> = ({ isOpen, onClose, onSelect }) => {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const [gifs, setGifs] = useState<GifResultData[]>([]);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const runSearch = useCallback(async (value: string) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    try {
      const results = await searchGifs(value, controller.signal);
      if (!controller.signal.aborted) setGifs(results.filter((gif) => isHttpsUrl(gif.PreviewUrl || gif.GifUrl) && isHttpsUrl(gif.GifUrl)));
    } catch {
      if (!controller.signal.aborted) setGifs([]);
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    setQuery('');
    void runSearch('');
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      abortRef.current?.abort();
    };
  }, [isOpen, runSearch]);

  const changeQuery = (value: string) => {
    setQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => void runSearch(value), SEARCH_DEBOUNCE_MS);
  };

  return (
    <CustomBottomSheet isOpen={isOpen} onClose={onClose} snapPoints={[70]} testID="gif-picker-sheet">
      <VStack space="md" className="w-full">
        <Input>
          <InputField testID="gif-picker-search" value={query} onChangeText={changeQuery} placeholder={t('chat.search_gifs')} accessibilityLabel={t('chat.search_gifs')} />
        </Input>
        {loading ? (
          <View className="h-40 items-center justify-center">
            <Spinner testID="gif-picker-loading" />
          </View>
        ) : gifs.length === 0 ? (
          <View className="h-40 items-center justify-center">
            <Text className="text-typography-500" testID="gif-picker-empty">
              {t('chat.no_gifs')}
            </Text>
          </View>
        ) : (
          <HStack className="flex-wrap justify-between">
            {gifs.map((gif) => (
              <Pressable
                key={gif.Id}
                testID={`gif-picker-item-${gif.Id}`}
                onPress={() => {
                  onSelect(gif);
                  onClose();
                }}
                accessibilityRole="button"
                accessibilityLabel={gif.Title || t('chat.gif')}
                className="mb-2 w-[48%] overflow-hidden rounded-lg bg-background-100"
              >
                <Image source={{ uri: gif.PreviewUrl || gif.GifUrl }} style={{ width: '100%', height: 120 }} contentFit="cover" />
              </Pressable>
            ))}
          </HStack>
        )}
      </VStack>
    </CustomBottomSheet>
  );
};
