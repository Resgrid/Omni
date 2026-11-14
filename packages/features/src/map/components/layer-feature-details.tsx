import { useTranslation } from '@resgrid/i18n';
import { Heading, HStack, Pressable, Text, useThemeColors, VStack } from '@resgrid/ui';
import { X } from 'lucide-react-native';
import React from 'react';
import { View } from 'react-native';

import type { LayerFeatureDetails } from '../lib/layer-details';
import { MapDetailsPanel } from './map-pin-details';

export interface LayerFeatureSelection extends LayerFeatureDetails {
  /** The department layer the feature belongs to. */
  layerName: string;
}

export interface LayerFeaturePanelProps {
  isOpen: boolean;
  presentation: 'sheet' | 'docked';
  feature: LayerFeatureSelection;
  onClose: () => void;
}

/**
 * A tapped layer feature (an imported vendor, stop or zone): its name, category and description as plain text — layer
 * files come from outside the department, so nothing here is ever rendered as HTML or turned into a link.
 */
export const LayerFeaturePanel: React.FC<LayerFeaturePanelProps> = ({ isOpen, presentation, feature, onClose }) => {
  const { t } = useTranslation();
  const colors = useThemeColors();
  const title = feature.name || feature.category || feature.layerName;
  const showCategory = !!feature.category && feature.category !== title;

  return (
    <MapDetailsPanel isOpen={isOpen} presentation={presentation} onClose={onClose} testID="layer-feature">
      <VStack space="md" testID="layer-feature-details">
        <HStack className="items-start justify-between">
          <VStack className="flex-1 pr-2">
            {feature.layerName ? (
              <Text className="text-xs font-semibold uppercase text-typography-500" testID="layer-feature-layer">
                {feature.layerName}
              </Text>
            ) : null}
            <Heading size="md" testID="layer-feature-title">
              {title}
            </Heading>
          </VStack>
          <Pressable onPress={onClose} hitSlop={10} accessibilityRole="button" accessibilityLabel={t('common.close')} testID="layer-feature-close">
            <View>
              <X size={20} color={colors.textMuted} />
            </View>
          </Pressable>
        </HStack>
        {showCategory ? (
          <VStack space="xs" testID="layer-feature-category">
            <Text className="text-xs font-medium text-typography-500">{t('maps.layer_info.category')}</Text>
            <Text className="text-sm text-typography-900">{feature.category}</Text>
          </VStack>
        ) : null}
        {feature.description ? (
          <Text className="text-sm text-typography-900" testID="layer-feature-description">
            {feature.description}
          </Text>
        ) : null}
      </VStack>
    </MapDetailsPanel>
  );
};
