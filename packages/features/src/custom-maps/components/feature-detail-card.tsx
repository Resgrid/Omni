import { useTranslation } from '@resgrid/i18n';
import { HStack, Pressable, Text, View, VStack } from '@resgrid/ui';
import { X } from 'lucide-react-native';
import React from 'react';
import { StyleSheet } from 'react-native';

export interface FeatureDetailCardProps {
  name: string;
  description?: string | null;
  /** `maps.region` / `maps.zone`. */
  kindKey: string;
  onClose: () => void;
  testID?: string;
}

/** The tapped region or zone, over the map (Unit/IC custom and indoor map viewers). */
export const FeatureDetailCard: React.FC<FeatureDetailCardProps> = ({ name, description, kindKey, onClose, testID = 'map-feature-card' }) => {
  const { t } = useTranslation();
  return (
    <View style={styles.card} className="bg-background-0" testID={testID}>
      <HStack className="items-start">
        <VStack className="flex-1">
          <Text className="text-xs uppercase text-typography-500">{t(kindKey)}</Text>
          <Text className="text-base font-bold text-typography-900">{name || t(kindKey)}</Text>
          {description ? <Text className="mt-1 text-sm text-typography-600">{description}</Text> : null}
        </VStack>
        <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel={t('common.close')} className="p-1" testID={`${testID}-close`}>
          <X size={18} color="#6b7280" />
        </Pressable>
      </HStack>
    </View>
  );
};

const styles = StyleSheet.create({
  card: { borderRadius: 12, bottom: 16, elevation: 4, left: 16, padding: 14, position: 'absolute', right: 16, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.15, shadowRadius: 6 },
});
