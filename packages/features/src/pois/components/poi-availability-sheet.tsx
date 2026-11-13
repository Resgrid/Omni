import { formatInTimeZone } from '@resgrid/core/utils/dates';
import { usePoisStore } from '@resgrid/data';
import { useDepartmentTimeZone } from '@resgrid/features/department-config';
import { useTranslation } from '@resgrid/i18n';
import { PoiAvailabilityStatuses, type PoiResultData } from '@resgrid/models';
import { Button, ButtonText, Checkbox, CheckboxIndicator, CheckboxLabel, CustomBottomSheet, HStack, Pressable, ScrollView, Spinner, Text, Textarea, TextareaInput, useToast, VStack } from '@resgrid/ui';
import React, { useEffect, useMemo, useRef, useState } from 'react';

import { availabilityExpiresAt, availabilityLabelKey, hasCapabilityId, minutesUntil, poiAvailabilityStatus, poiCapabilityOptions, toggleCapabilityId } from '../lib/poi-availability';

/** Core caps a note at 500 characters (PoiAvailability.MaxNoteLength). */
export const AVAILABILITY_NOTE_MAX = 500;

/** Expiry choices in minutes; null lasts until someone changes it. */
export const AVAILABILITY_EXPIRY_CHOICES: readonly (number | null)[] = [null, 60, 120, 240, 480, 720, 1440];

/** The expiry choice that keeps the current report's end (offered while it has one). */
const KEEP_EXPIRY = 'keep';

type ExpiryChoice = number | null | typeof KEEP_EXPIRY;

const STATUSES: readonly PoiAvailabilityStatuses[] = [PoiAvailabilityStatuses.Open, PoiAvailabilityStatuses.Limited, PoiAvailabilityStatuses.Diversion, PoiAvailabilityStatuses.Closed];

export interface PoiAvailabilitySheetProps {
  isOpen: boolean;
  onClose: () => void;
  poi: PoiResultData;
  /** The destination after a successful change. */
  onSaved?: (poi: PoiResultData | null) => void;
}

/**
 * Sets a destination's availability (Dispatch and IC, `capabilities.calls.destinationAvailability`): open, limited,
 * diversion or closed, the capabilities it cannot provide, what it reported, and when the report lapses. Online only.
 */
export const PoiAvailabilitySheet: React.FC<PoiAvailabilitySheetProps> = ({ isOpen, onClose, poi, onSaved }) => {
  const { t } = useTranslation();
  const toast = useToast();
  const timeZone = useDepartmentTimeZone();
  const capabilities = useMemo(() => poiCapabilityOptions(poi), [poi]);
  const [status, setStatus] = useState<PoiAvailabilityStatuses>(PoiAvailabilityStatuses.Open);
  const [unavailable, setUnavailable] = useState<string[]>([]);
  const [note, setNote] = useState('');
  const [expiresIn, setExpiresIn] = useState<ExpiryChoice>(null);
  // When the report being edited lapses (epoch ms), so a save that leaves the expiry alone keeps it; null without one.
  const [currentExpiry, setCurrentExpiry] = useState<number | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  // The destination this open was started from: a refreshed copy of it (the detail screen re-reads it) keeps the edits.
  const draftFor = useRef<number | null>(null);

  // Each open starts from what the destination reports now.
  useEffect(() => {
    if (!isOpen) {
      draftFor.current = null;

      return;
    }

    if (draftFor.current === poi.PoiId) return;
    draftFor.current = poi.PoiId;
    const expiresAt = availabilityExpiresAt(poi);

    setStatus(poiAvailabilityStatus(poi));
    setUnavailable([...(poi.UnavailableCapabilityIds ?? [])]);
    setNote(poi.AvailabilityNote ?? '');
    setCurrentExpiry(expiresAt);
    setExpiresIn(expiresAt === null ? null : KEEP_EXPIRY);
    setIsSaving(false);
  }, [isOpen, poi]);

  const isOpenStatus = status === PoiAvailabilityStatuses.Open;
  const toggle = (id: string) => setUnavailable((current) => toggleCapabilityId(current, id));
  const expiryChoices: readonly ExpiryChoice[] = currentExpiry === null ? AVAILABILITY_EXPIRY_CHOICES : [KEEP_EXPIRY, ...AVAILABILITY_EXPIRY_CHOICES];

  const expiryLabel = (choice: ExpiryChoice): string => {
    if (choice === KEEP_EXPIRY) return t('pois.availability.until', { time: currentExpiry === null ? '' : formatInTimeZone(new Date(currentExpiry), timeZone) });

    return choice === null ? t('pois.availability.expires_never') : t('pois.availability.expires_hours', { count: choice / 60 });
  };

  // Leaving the expiry alone sends what is left of it: a note or capability change does not make the report last forever.
  const expiresInMinutes = (): number | null => (expiresIn === KEEP_EXPIRY ? (currentExpiry === null ? null : minutesUntil(currentExpiry)) : expiresIn);

  const save = async () => {
    if (isSaving) return;

    // The report lapsed while the sheet was open: keeping its end would restrict the destination again. The choice to
    // keep it goes and the dispatcher picks how long the new report lasts (or sets it open).
    if (!isOpenStatus && expiresIn === KEEP_EXPIRY && (currentExpiry === null || currentExpiry <= Date.now())) {
      setCurrentExpiry(null);
      toast.error(t('pois.availability.expiry_passed'));

      return;
    }

    setIsSaving(true);

    const outcome = await usePoisStore.getState().setPoiAvailability({
      PoiId: poi.PoiId,
      Status: status,
      UnavailableCapabilityIds: isOpenStatus ? [] : unavailable,
      Note: isOpenStatus ? '' : note.trim().slice(0, AVAILABILITY_NOTE_MAX),
      ExpiresInMinutes: isOpenStatus ? null : expiresInMinutes(),
    });

    setIsSaving(false);

    if (!outcome.ok) {
      toast.error(t('pois.availability.save_failed'));

      return;
    }

    toast.success(t('pois.availability.saved'));
    onSaved?.(outcome.poi);
    onClose();
  };

  return (
    <CustomBottomSheet isOpen={isOpen} onClose={() => (isSaving ? undefined : onClose())} snapPoints={[80]} testID="poi-availability-sheet">
      <VStack space="md" className="w-full">
        <Text className="text-xl font-bold text-typography-900" accessibilityRole="header">
          {t('pois.availability.set_title')}
        </Text>
        <ScrollView keyboardShouldPersistTaps="handled">
          <VStack space="md">
            <HStack space="sm" className="flex-wrap">
              {STATUSES.map((value) => (
                <Pressable
                  key={value}
                  onPress={() => setStatus(value)}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: status === value }}
                  testID={`poi-availability-status-${value}`}
                  className={`mb-2 rounded-lg px-3 py-2 ${status === value ? 'bg-primary-500' : 'bg-background-100'}`}
                >
                  <Text className={`font-semibold ${status === value ? 'text-typography-0' : 'text-typography-700'}`}>{t(availabilityLabelKey(value))}</Text>
                </Pressable>
              ))}
            </HStack>

            {!isOpenStatus && capabilities.length > 0 ? (
              <VStack space="xs" testID="poi-availability-capabilities">
                <Text className="text-sm font-semibold text-typography-700">{t('pois.availability.unavailable_capabilities')}</Text>
                {capabilities.map((capability) => (
                  <Checkbox
                    key={capability.id}
                    value={capability.id}
                    isChecked={hasCapabilityId(unavailable, capability.id)}
                    onChange={() => toggle(capability.id)}
                    aria-label={capability.name}
                    testID={`poi-availability-capability-${capability.id}`}
                  >
                    <CheckboxIndicator />
                    <CheckboxLabel>{capability.name}</CheckboxLabel>
                  </Checkbox>
                ))}
              </VStack>
            ) : null}

            {!isOpenStatus ? (
              <VStack space="xs">
                <Text className="text-sm font-semibold text-typography-700">{t('pois.availability.note')}</Text>
                <Textarea size="md" className="min-h-[80px]">
                  <TextareaInput
                    value={note}
                    onChangeText={(value) => setNote(value.slice(0, AVAILABILITY_NOTE_MAX))}
                    placeholder={t('pois.availability.note_placeholder')}
                    accessibilityLabel={t('pois.availability.note')}
                    testID="poi-availability-note"
                  />
                </Textarea>
                <Text className="text-sm font-semibold text-typography-700">{t('pois.availability.expires')}</Text>
                <HStack space="sm" className="flex-wrap">
                  {expiryChoices.map((choice) => (
                    <Pressable
                      key={choice ?? 'never'}
                      onPress={() => setExpiresIn(choice)}
                      accessibilityRole="radio"
                      accessibilityState={{ selected: expiresIn === choice }}
                      testID={`poi-availability-expires-${choice ?? 'never'}`}
                      className={`mb-2 rounded-full px-3 py-1.5 ${expiresIn === choice ? 'bg-primary-500' : 'bg-background-100'}`}
                    >
                      <Text className={`text-sm ${expiresIn === choice ? 'text-typography-0' : 'text-typography-700'}`}>{expiryLabel(choice)}</Text>
                    </Pressable>
                  ))}
                </HStack>
              </VStack>
            ) : null}
          </VStack>
        </ScrollView>
        <HStack space="md">
          <Button variant="outline" action="secondary" className="flex-1" onPress={onClose} isDisabled={isSaving} testID="poi-availability-cancel">
            <ButtonText>{t('common.cancel')}</ButtonText>
          </Button>
          <Button className="flex-1" onPress={() => void save()} isDisabled={isSaving} testID="poi-availability-save">
            {isSaving ? <Spinner size="small" /> : <ButtonText>{t('common.save')}</ButtonText>}
          </Button>
        </HStack>
      </VStack>
    </CustomBottomSheet>
  );
};
