import { SuggestedDestinationsPanel } from '@resgrid/features/pois/components/suggested-destinations-panel';
import type { DestinationFillState } from '@resgrid/features/pois/lib/destination-fill';
import { toDestinationOrigin } from '@resgrid/features/pois/lib/poi-availability';
import { useTranslation } from '@resgrid/i18n';
import { Button, ButtonText, Input, InputField, Pressable, Spinner, Text, useThemeColors, useToast } from '@resgrid/ui';
import { ChevronDown, MapPin, Search, X } from 'lucide-react-native';
import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { type CallFormErrorKey, type CallFormValues, clearDestination, type DestinationKind, hasFreeDestination, parseCoordinates, toDestinationFields, withDestinationPoi } from '../../lib/call-form';
import { type GeocodeLookup, isWhat3WordsFormat, lookupAddress, lookupPlusCode, lookupWhat3Words } from '../../lib/call-geocoding';
import { OptionChips } from '../option-chips';

type DestinationLookup = 'address' | 'what3words' | 'plusCode';

type DestinationTextKey = 'destinationAddress' | 'destinationLatitude' | 'destinationLongitude' | 'destinationWhat3Words' | 'destinationPlusCode';

/** The errors the destination's latitude and longitude fields show. */
const DESTINATION_POINT_ERRORS: readonly CallFormErrorKey[] = ['destinationLatitude', 'destinationLongitude'];

const LOOKUP_MESSAGES = {
  address: { required: 'calls.address_required', found: 'calls.destination_found', notFound: 'calls.address_not_found', failed: 'calls.geocoding_error' },
  what3words: { required: 'calls.what3words_required', found: 'calls.destination_found', notFound: 'calls.what3words_not_found', failed: 'calls.what3words_geocoding_error' },
  plusCode: { required: 'calls.plus_code_required', found: 'calls.destination_found', notFound: 'calls.plus_code_not_found', failed: 'calls.plus_code_geocoding_error' },
} as const satisfies Record<DestinationLookup, Record<'required' | 'found' | 'notFound' | 'failed', string>>;

export interface CallDestinationFieldsProps {
  values: CallFormValues;
  /** Changes the form's values (a functional update). */
  update: (change: (current: CallFormValues) => CallFormValues) => void;
  /** The department has destination POIs: the POI / location switch is offered. */
  poisAvailable: boolean;
  /** The picked POI as it shows (its name, or what the call stores for a POI no longer listed); null when none. */
  poiLabel: string | null;
  /** The department requires a destination (`destinationPoi`): a POI or a free location. */
  required: boolean;
  errors: Partial<Record<CallFormErrorKey, string>>;
  /** Drops errors the dispatcher has fixed. */
  clearErrors: (keys: readonly CallFormErrorKey[]) => void;
  isOnline: boolean;
  onOpenPoiPicker: () => void;
  /** Opens the app's map picker for the destination point; null when the app has none. */
  onOpenMapPicker: (() => void) | null;
  /** The call being edited (update form), so destination suggestions can read its type and priority; null for a new call. */
  callId?: number | string | null;
  /**
   * Destination suggestions may fill an empty destination ("Suggest and fill"): a new call only. Never while the
   * destination is a free location or a route's end.
   */
  canFillDestination?: boolean;
  /** True when the destination picker lists the POI (suggestions only offer those). */
  isDestinationPoi?: (poiId: number) => boolean;
  /**
   * The form's "Suggest and fill" state for its session: switching the destination kind remounts the suggestions, and a
   * pick or clear by hand before the switch must still stop the filling after it.
   */
  destinationFill?: React.RefObject<DestinationFillState | null>;
}

/**
 * The call's Destination (Core M0322; the `destinationPoi` policy key governs it all): a destination POI (searchable, as
 * before) or a free location — an address (server lookup), a point, what3words (lookup) or a plus code (lookup only, never
 * stored) — or a spot picked on the map. The two kinds are exclusive: switching clears the other.
 */
export const CallDestinationFields: React.FC<CallDestinationFieldsProps> = ({
  values,
  update,
  poisAvailable,
  poiLabel,
  required,
  errors,
  clearErrors,
  isOnline,
  onOpenPoiPicker,
  onOpenMapPicker,
  callId = null,
  canFillDestination = false,
  isDestinationPoi,
  destinationFill,
}) => {
  const { t } = useTranslation();
  const toast = useToast();
  const colors = useThemeColors();
  const [lookup, setLookup] = useState<DestinationLookup | null>(null);
  // A POI already on the call shows as one even if the department's list no longer has it.
  const kind: DestinationKind = values.destinationPoiId !== null ? 'poi' : poisAvailable ? values.destinationKind : 'location';
  const requiredError = errors.destinationPoi;
  // "Suggest and fill" never over a free location or a route's end (a new call only).
  const suggestionsMayFill = canFillDestination ? !hasFreeDestination(values) && values.routePlanId === null : false;
  const marker = required ? ' *' : '';

  const setText = (key: DestinationTextKey, text: string) => {
    update((current) => ({ ...current, [key]: text }));

    if (key === 'destinationLatitude' || key === 'destinationLongitude') clearErrors([key]);
  };

  /** A point typed or pasted: "lat, lon" pasted into either field fills both. */
  const setCoordinate = (key: 'destinationLatitude' | 'destinationLongitude', text: string) => {
    const pasted = parseCoordinates(text);

    if (pasted.ok) {
      update((current) => ({ ...current, ...toDestinationFields(pasted.latitude, pasted.longitude) }));
      clearErrors(DESTINATION_POINT_ERRORS);
    } else {
      setText(key, text);
    }
  };

  const runLookup = async (kindOfLookup: DestinationLookup) => {
    const text = (kindOfLookup === 'address' ? values.destinationAddress : kindOfLookup === 'what3words' ? values.destinationWhat3Words : values.destinationPlusCode).trim();
    const messages = LOOKUP_MESSAGES[kindOfLookup];

    if (!text) {
      toast.warning(t(messages.required));

      return;
    }

    if (kindOfLookup === 'what3words' && !isWhat3WordsFormat(text)) {
      toast.warning(t('calls.what3words_invalid_format'));

      return;
    }

    setLookup(kindOfLookup);

    try {
      const result: GeocodeLookup = await (kindOfLookup === 'address' ? lookupAddress(text) : kindOfLookup === 'what3words' ? lookupWhat3Words(text) : lookupPlusCode(text));
      const place = result.place;

      if (place) {
        update((current) => ({ ...current, ...toDestinationFields(place.latitude, place.longitude), destinationAddress: place.address || current.destinationAddress }));
        clearErrors(DESTINATION_POINT_ERRORS);
        toast.success(t(messages.found));
      } else {
        toast.error(t(result.succeeded ? messages.notFound : messages.failed));
      }
    } catch {
      toast.error(t(messages.failed));
    } finally {
      setLookup(null);
    }
  };

  const lookupButton = (kindOfLookup: DestinationLookup, label: string, value: string, testID: string) => (
    <Button
      variant="outline"
      size="sm"
      className="ml-2"
      onPress={() => void runLookup(kindOfLookup)}
      isDisabled={!isOnline || lookup !== null || !value.trim()}
      accessibilityLabel={label}
      accessibilityState={{ busy: lookup === kindOfLookup }}
      testID={testID}
    >
      {lookup === kindOfLookup ? (
        <Spinner size="small" />
      ) : (
        <View>
          <Search size={16} color={colors.icon} />
        </View>
      )}
    </Button>
  );

  const field = (
    key: DestinationTextKey,
    label: string,
    options: { placeholder?: string; testID: string; errorKey?: CallFormErrorKey; numeric?: boolean; onChange?: (text: string) => void; action?: React.ReactNode }
  ) => {
    const error = options.errorKey ? errors[options.errorKey] : undefined;

    return (
      <View style={styles.field}>
        <Text size="sm" className="mb-1 text-typography-700">
          {label}
        </Text>
        <View style={styles.inputRow}>
          <Input variant="outline" isInvalid={!!error} className="flex-1">
            <InputField
              value={values[key]}
              onChangeText={(text: string) => (options.onChange ? options.onChange(text) : setText(key, text))}
              placeholder={options.placeholder}
              keyboardType={options.numeric ? 'numbers-and-punctuation' : 'default'}
              accessibilityLabel={label}
              testID={options.testID}
            />
          </Input>
          {options.action}
        </View>
        {error ? (
          <Text size="xs" className="mt-1 text-error-600" testID={`${options.testID}-error`}>
            {t(error)}
          </Text>
        ) : null}
      </View>
    );
  };

  return (
    <View testID="call-form-destination-fields">
      {poisAvailable ? (
        <View style={styles.field}>
          <OptionChips<DestinationKind>
            options={[
              { value: 'poi', label: t('calls.destination_mode_poi') },
              { value: 'location', label: t('calls.destination_mode_location') },
            ]}
            selected={[kind]}
            onToggle={(next) => (next === kind ? undefined : update((current) => clearDestination(current, next)))}
            accessibilityLabel={t('calls.destination')}
            testID="call-form-destination-kind"
          />
        </View>
      ) : null}
      {kind === 'poi' ? (
        // A department can have hundreds of destinations: a searchable picker, not a row of chips.
        <View style={styles.field}>
          <Text size="sm" className="mb-1 text-typography-700">
            {`${t('calls.destination_poi')}${marker}`}
          </Text>
          <View style={styles.inputRow}>
            <Pressable
              onPress={onOpenPoiPicker}
              accessibilityRole="button"
              accessibilityLabel={poiLabel ? `${t('calls.destination_poi')}: ${poiLabel}` : t('calls.destination_poi_select')}
              testID="call-form-destination"
              className={`flex-1 flex-row items-center rounded border px-3 py-2 ${requiredError ? 'border-error-600' : 'border-outline-300'}`}
            >
              <Text className={poiLabel ? 'flex-1 text-typography-900' : 'flex-1 text-typography-400'} numberOfLines={1}>
                {poiLabel ?? t('calls.destination_poi_select')}
              </Text>
              <View>
                <ChevronDown size={16} color={colors.icon} />
              </View>
            </Pressable>
            {values.destinationPoiId === null ? null : (
              <Button
                variant="outline"
                size="sm"
                className="ml-2"
                onPress={() => update((current) => withDestinationPoi(current, null))}
                accessibilityLabel={t('calls.destination_poi_clear')}
                testID="call-form-destination-clear"
              >
                <View>
                  <X size={16} color={colors.icon} />
                </View>
              </Button>
            )}
          </View>
          {poisAvailable ? (
            // Destination rules (Mapping -> Destination Rules): the best destinations for this call, and "Suggest and fill".
            <SuggestedDestinationsPanel
              origin={toDestinationOrigin(values.latitude, values.longitude)}
              callType={values.type}
              priority={values.priority}
              callId={callId}
              selectedPoiId={values.destinationPoiId}
              canFill={suggestionsMayFill}
              onSelect={(poiId) => update((current) => withDestinationPoi(current, poiId))}
              isSelectable={isDestinationPoi}
              fillState={destinationFill}
              testID="call-form-destination-suggestions"
            />
          ) : null}
        </View>
      ) : (
        <View testID="call-form-destination-location">
          {field('destinationAddress', `${t('calls.destination_address')}${marker}`, {
            placeholder: t('calls.destination_address_placeholder'),
            testID: 'call-form-destination-address',
            action: lookupButton('address', t('calls.search_address'), values.destinationAddress, 'call-form-destination-address-search'),
          })}
          <View style={styles.coordinateRow}>
            <View style={styles.coordinateCell}>
              {field('destinationLatitude', t('calls.latitude'), {
                placeholder: t('calls.latitude_placeholder'),
                testID: 'call-form-destination-latitude',
                errorKey: 'destinationLatitude',
                numeric: true,
                onChange: (text) => setCoordinate('destinationLatitude', text),
              })}
            </View>
            <View style={styles.coordinateCellLast}>
              {field('destinationLongitude', t('calls.longitude'), {
                placeholder: t('calls.longitude_placeholder'),
                testID: 'call-form-destination-longitude',
                errorKey: 'destinationLongitude',
                numeric: true,
                onChange: (text) => setCoordinate('destinationLongitude', text),
              })}
            </View>
          </View>
          {field('destinationWhat3Words', t('calls.what3words'), {
            placeholder: t('calls.what3words_placeholder'),
            testID: 'call-form-destination-w3w',
            action: lookupButton('what3words', t('calls.search_what3words'), values.destinationWhat3Words, 'call-form-destination-w3w-search'),
          })}
          {field('destinationPlusCode', t('calls.plus_code'), {
            placeholder: t('calls.plus_code_placeholder'),
            testID: 'call-form-destination-plus-code',
            action: lookupButton('plusCode', t('calls.search_plus_code'), values.destinationPlusCode, 'call-form-destination-plus-code-search'),
          })}
          <View style={styles.actions}>
            {onOpenMapPicker ? (
              <Button variant="outline" size="sm" className="mb-2 mr-2" onPress={onOpenMapPicker} accessibilityLabel={t('calls.destination_pick_on_map')} testID="call-form-destination-pick-on-map">
                <View style={styles.buttonIcon}>
                  <MapPin size={16} color={colors.primary} />
                </View>
                <ButtonText>{t('calls.destination_pick_on_map')}</ButtonText>
              </Button>
            ) : null}
            {hasFreeDestination(values) || values.destinationPlusCode.trim() ? (
              <Button
                variant="outline"
                size="sm"
                className="mb-2"
                onPress={() => {
                  update((current) => clearDestination(current, 'location'));
                  clearErrors(DESTINATION_POINT_ERRORS);
                }}
                accessibilityLabel={t('calls.destination_location_clear')}
                testID="call-form-destination-location-clear"
              >
                <View style={styles.buttonIcon}>
                  <X size={16} color={colors.icon} />
                </View>
                <ButtonText>{t('calls.destination_location_clear')}</ButtonText>
              </Button>
            ) : null}
          </View>
        </View>
      )}
      {requiredError ? (
        <Text size="xs" className="mb-2 text-error-600" testID="call-form-destination-error">
          {t(requiredError)}
        </Text>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  field: { marginBottom: 10 },
  inputRow: { flexDirection: 'row', alignItems: 'center' },
  coordinateRow: { flexDirection: 'row', alignItems: 'flex-start' },
  coordinateCell: { flex: 1, marginRight: 8 },
  coordinateCellLast: { flex: 1 },
  actions: { flexDirection: 'row', flexWrap: 'wrap' },
  buttonIcon: { marginRight: 4 },
});
