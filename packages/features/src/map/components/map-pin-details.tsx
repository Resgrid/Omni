import { useTranslation } from '@resgrid/i18n';
import type { MapMakerInfoData } from '@resgrid/models';
import { Badge, BadgeText, Button, ButtonText, CustomBottomSheet, Heading, HStack, Pressable, Text, useThemeColors, VStack } from '@resgrid/ui';
import { type LucideIcon, MapPin, X } from 'lucide-react-native';
import React from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

/** One action under a pin (open the call / unit / member / POI, set as the current call, directions). */
export interface MapPinAction {
  id: string;
  label: string;
  icon: LucideIcon;
  onPress: () => void;
  /** The filled (primary) button; the rest are outlined. */
  primary?: boolean;
}

export interface MapPinDetailsProps {
  pin: MapMakerInfoData;
  /** What the pin is ("Call", the department's word for units, a POI type…). */
  kindLabel: string;
  /** "Current call", "Your unit". */
  badges?: readonly string[];
  actions: readonly MapPinAction[];
  onClose: () => void;
}

const Row: React.FC<{ label: string; value: string; testID?: string }> = ({ label, value, testID }) => (
  <VStack space="xs" testID={testID}>
    <Text className="text-xs font-medium text-typography-500">{label}</Text>
    <Text className="text-sm text-typography-900">{value}</Text>
  </VStack>
);

/**
 * A tapped pin's details and actions (baseline Unit pin-detail-modal, plus open unit / member). Server text is shown as
 * plain text; every action comes from the screen, so navigation, toasts and stores stay out of this component.
 */
export const MapPinDetails: React.FC<MapPinDetailsProps> = ({ pin, kindLabel, badges = [], actions, onClose }) => {
  const { t } = useTranslation();
  const colors = useThemeColors();
  const hasCoordinates = Number.isFinite(pin.Latitude) && Number.isFinite(pin.Longitude);

  return (
    <VStack space="md" testID="map-pin-details">
      <HStack className="items-start justify-between">
        <VStack className="flex-1 pr-2">
          <Text className="text-xs font-semibold uppercase text-typography-500" testID="map-pin-kind">
            {kindLabel}
          </Text>
          <Heading size="md" testID="map-pin-title">
            {pin.Title}
          </Heading>
        </VStack>
        <Pressable onPress={onClose} hitSlop={10} accessibilityRole="button" accessibilityLabel={t('common.close')} testID="map-pin-close">
          <View>
            <X size={20} color={colors.textMuted} />
          </View>
        </Pressable>
      </HStack>
      {badges.length > 0 ? (
        <HStack space="sm" className="flex-wrap">
          {badges.map((badge) => (
            <Badge key={badge} action="info" testID="map-pin-badge">
              <BadgeText>{badge}</BadgeText>
            </Badge>
          ))}
        </HStack>
      ) : null}
      {pin.InfoWindowContent ? (
        <Text className="text-sm text-typography-900" testID="map-pin-info">
          {pin.InfoWindowContent}
        </Text>
      ) : null}
      {pin.Address ? <Row label={t('map.pin_address')} value={pin.Address} testID="map-pin-address" /> : null}
      {pin.Note ? <Row label={t('map.pin_note')} value={pin.Note} testID="map-pin-note" /> : null}
      {pin.PoiTypeName ? <Row label={t('map.pin_type')} value={pin.PoiTypeName} testID="map-pin-poi-type" /> : null}
      {hasCoordinates ? (
        <HStack space="xs" className="items-center">
          <View>
            <MapPin size={14} color={colors.textMuted} />
          </View>
          <Text className="text-xs text-typography-500" testID="map-pin-coordinates">
            {pin.Latitude.toFixed(6)}, {pin.Longitude.toFixed(6)}
          </Text>
        </HStack>
      ) : null}
      {actions.length > 0 ? (
        <VStack space="sm">
          {actions.map((action) => {
            const Icon = action.icon;
            return (
              <Button key={action.id} variant={action.primary ? 'solid' : 'outline'} onPress={action.onPress} testID={`map-pin-action-${action.id}`}>
                <View>
                  <Icon size={18} color={action.primary ? colors.textInverse : colors.primary} />
                </View>
                <ButtonText>{action.label}</ButtonText>
              </Button>
            );
          })}
        </VStack>
      ) : null}
    </VStack>
  );
};

export interface MapPinPanelProps extends MapPinDetailsProps {
  isOpen: boolean;
  /** `sheet`: a bottom sheet over the map (phones); `docked`: a card beside the map that keeps it usable (tablet, desktop). */
  presentation: 'sheet' | 'docked';
}

/** The pin details as a bottom sheet on phones and a docked card on wide layouts (useFormFactor decides). */
export const MapPinPanel: React.FC<MapPinPanelProps> = ({ isOpen, presentation, ...details }) => {
  const colors = useThemeColors();
  if (presentation === 'sheet') {
    return (
      <CustomBottomSheet isOpen={isOpen} onClose={details.onClose} snapPoints={[55]} testID="map-pin-sheet">
        <MapPinDetails {...details} />
      </CustomBottomSheet>
    );
  }
  return isOpen ? (
    <View style={StyleSheet.flatten([styles.docked, { backgroundColor: colors.background, borderColor: colors.border }])} testID="map-pin-docked">
      <ScrollView contentContainerStyle={styles.dockedContent} keyboardShouldPersistTaps="handled">
        <MapPinDetails {...details} />
      </ScrollView>
    </View>
  ) : null;
};

const styles = StyleSheet.create({
  docked: {
    position: 'absolute',
    top: 12,
    right: 12,
    bottom: 12,
    width: 340,
    maxWidth: '45%',
    borderRadius: 16,
    borderWidth: 1,
    overflow: 'hidden',
    elevation: 6,
    shadowColor: '#000000',
    shadowOpacity: 0.2,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    zIndex: 20,
  },
  dockedContent: {
    padding: 16,
  },
});
