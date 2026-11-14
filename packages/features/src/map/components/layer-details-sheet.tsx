import { ContactField } from '@resgrid/features/contacts';
import { useTranslation } from '@resgrid/i18n';
import { Badge, BadgeText, CustomBottomSheet, Heading, HStack, Pressable, Text, useThemeColors, VStack } from '@resgrid/ui';
import { Building2, CalendarClock, Mail, Phone, UserRound, X } from 'lucide-react-native';
import React from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import type { DepartmentMapLayer } from '../hooks/use-department-layers';
import { eventPhaseAt, eventPhaseLabelKey, formatLayerEventDates, type LayerEventPhase } from '../lib/layer-details';

export interface LayerDetailsSheetProps {
  isOpen: boolean;
  layer: DepartmentMapLayer | null;
  onClose: () => void;
  /** Epoch ms the event phase is judged at (the screen passes when the sheet opened). */
  now: number;
  timeZone: string | null;
}

const PHASE_ACTION: Record<Exclude<LayerEventPhase, 'none'>, 'success' | 'info' | 'muted'> = { active: 'success', upcoming: 'info', ended: 'muted' };

/**
 * A department layer's details (`Mapping/GetMayLayers`): an event layer's phase and dates in the department's time
 * zone, its description, organizer and contact — the phone and email open the dialer and mail app. All of it is plain
 * text from the imported file or the layer form, never HTML.
 */
export const LayerDetailsSheet: React.FC<LayerDetailsSheetProps> = ({ isOpen, layer, onClose, now, timeZone }) => {
  const { t, i18n } = useTranslation();
  const colors = useThemeColors();
  const details = layer?.details ?? null;
  const phase = eventPhaseAt(details?.event, now);
  const phaseKey = eventPhaseLabelKey(phase);
  const dates = formatLayerEventDates(details?.event, timeZone, i18n.language, t);
  const hasContent = !!details && (!!phaseKey || !!dates || !!details.description || !!details.organizer || !!details.contactName || !!details.contactPhone || !!details.contactEmail);

  return (
    <CustomBottomSheet isOpen={isOpen} onClose={onClose} snapPoints={[65]} testID="layer-details-sheet">
      {layer ? (
        <ScrollView keyboardShouldPersistTaps="handled" testID="layer-details">
          <VStack space="md">
            <HStack className="items-start justify-between">
              <HStack space="sm" className="flex-1 items-center pr-2">
                {layer.color ? <View style={StyleSheet.flatten([styles.dot, { backgroundColor: layer.color }])} /> : null}
                <Heading size="md" className="flex-1" testID="layer-details-title">
                  {layer.name}
                </Heading>
              </HStack>
              <Pressable onPress={onClose} hitSlop={10} accessibilityRole="button" accessibilityLabel={t('common.close')} testID="layer-details-close">
                <View>
                  <X size={20} color={colors.textMuted} />
                </View>
              </Pressable>
            </HStack>
            {phaseKey || dates ? (
              <HStack space="sm" className="flex-wrap items-center">
                {phase !== 'none' && phaseKey ? (
                  <Badge action={PHASE_ACTION[phase]} testID="layer-details-phase">
                    <BadgeText>{t(phaseKey)}</BadgeText>
                  </Badge>
                ) : null}
                {dates ? (
                  <HStack space="xs" className="items-center">
                    <View>
                      <CalendarClock size={14} color={colors.textMuted} />
                    </View>
                    <Text className="text-sm text-typography-700" testID="layer-details-dates">
                      {dates}
                    </Text>
                  </HStack>
                ) : null}
              </HStack>
            ) : null}
            {details?.description ? (
              <Text className="text-sm text-typography-900" testID="layer-details-description">
                {details.description}
              </Text>
            ) : null}
            {details ? (
              <VStack>
                <ContactField label={t('maps.layer_info.organizer')} value={details.organizer} icon={<Building2 size={18} color={colors.textMuted} />} testID="layer-details-organizer" />
                <ContactField label={t('maps.layer_info.contact')} value={details.contactName} icon={<UserRound size={18} color={colors.textMuted} />} testID="layer-details-contact" />
                <ContactField label={t('maps.layer_info.phone')} value={details.contactPhone} action="phone" icon={<Phone size={18} color={colors.primary} />} testID="layer-details-phone" />
                <ContactField label={t('maps.layer_info.email')} value={details.contactEmail} action="email" icon={<Mail size={18} color={colors.primary} />} testID="layer-details-email" />
              </VStack>
            ) : null}
            {hasContent ? null : (
              <Text className="text-sm text-typography-500" testID="layer-details-empty">
                {t('maps.layer_info.no_details')}
              </Text>
            )}
            {details?.sourceFileName ? (
              <Text className="text-xs text-typography-500" testID="layer-details-source">
                {t('maps.layer_info.source_file', { name: details.sourceFileName })}
              </Text>
            ) : null}
          </VStack>
        </ScrollView>
      ) : null}
    </CustomBottomSheet>
  );
};

const styles = StyleSheet.create({
  dot: {
    width: 14,
    height: 14,
    borderRadius: 7,
  },
});
