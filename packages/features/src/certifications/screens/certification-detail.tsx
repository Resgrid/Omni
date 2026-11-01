import { useCertificationsStore } from '@resgrid/data';
import { ConfirmDialog, goBackOr } from '@resgrid/features/auth-ui';
import { useTranslation } from '@resgrid/i18n';
import type { CertificationCredit } from '@resgrid/models';
import { Button, ButtonText, DateTimeField, HStack, Input, InputField, Loading, ScreenHeader, ScrollView, Text, View, VStack, ZeroState } from '@resgrid/ui';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import { StyleSheet } from 'react-native';

import { useExpiryText } from '../hooks/use-expiry-text';
import { type CapturedPhoto, capturePhoto, PhotoPermissionError } from '../lib/capture-photo';
import { certificationErrorKey, certificationName, dayOf, expiryTone, hoursOf, optionalDate } from '../lib/certification-format';
import { certificationsRoutes, parseCertificationId } from '../routes';

export interface CertificationDetailScreenProps {
  /** Defaults to the `id` route parameter. */
  certificationId?: number;
}

const EMPTY_CREDITS: readonly CertificationCredit[] = [];

/**
 * One certification (Responder): dates and status, the department's verification, renewal, and the continuing-education
 * hours logged toward it (an optional certificate photo per entry). Changes are online only; failures stay on screen.
 */
export default function CertificationDetailScreen({ certificationId }: CertificationDetailScreenProps) {
  const { t } = useTranslation();
  const params = useLocalSearchParams<{ id?: string }>();
  const id = certificationId ?? parseCertificationId(params.id);
  const detail = useCertificationsStore((state) => (id ? (state.certificationsById[id] ?? state.certifications.find((item) => item.Id === id)) : undefined));
  const credits = useCertificationsStore((state) => (id ? (state.creditsByCertification[id] ?? EMPTY_CREDITS) : EMPTY_CREDITS));
  const isLoading = useCertificationsStore((state) => state.loading.detail === true);
  const loadError = useCertificationsStore((state) => state.errors.detail ?? null);
  const expiryText = useExpiryText();
  const [renewTo, setRenewTo] = useState('');
  const [renewNumber, setRenewNumber] = useState('');
  const [creditDate, setCreditDate] = useState('');
  const [creditHours, setCreditHours] = useState('');
  const [creditCategory, setCreditCategory] = useState('');
  const [creditNote, setCreditNote] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);

  useEffect(() => {
    if (!id) return;
    const store = useCertificationsStore.getState();
    void store.fetchCertification(id, { bypassCache: true });
    void store.fetchCredits(id);
  }, [id]);

  const goBack = useCallback(() => goBackOr(certificationsRoutes.list()), []);

  /** The store keeps the last action's failure; it is shown only for an action taken on this screen. */
  const failureText = useCallback((): string => {
    const failure = useCertificationsStore.getState().actionError;
    return failure ? t(certificationErrorKey(failure)) : t('certifications.errors.retry');
  }, [t]);

  const run = async (work: () => Promise<boolean>, successKey: string): Promise<boolean> => {
    if (isBusy) return false;
    setIsBusy(true);
    setMessage(null);
    setErrorText(null);
    try {
      const ok = await work();
      if (ok) setMessage(t(successKey));
      else setErrorText(failureText());
      return ok;
    } finally {
      setIsBusy(false);
    }
  };

  const renew = async () => {
    if (!id) return;
    const date = optionalDate(renewTo);
    if (!date.ok) {
      setMessage(t('certifications.dateInvalid'));
      return;
    }
    const ok = await run(async () => (await useCertificationsStore.getState().renew({ Id: id, ExpiresOn: date.value, Number: renewNumber.trim() || null })) !== null, 'certifications.renewed');
    if (ok) {
      setRenewTo('');
      setRenewNumber('');
    }
  };

  const addCredit = async (withPhoto: boolean) => {
    if (!id) return;
    const hours = hoursOf(creditHours);
    const date = optionalDate(creditDate);
    if (hours === null || !date.ok) {
      setMessage(hours === null ? t('certifications.hoursInvalid') : t('certifications.dateInvalid'));
      return;
    }
    let photo: CapturedPhoto | null = null;
    if (withPhoto) {
      try {
        photo = await capturePhoto('camera', 'ce-certificate.jpg');
      } catch (failure) {
        setMessage(failure instanceof PhotoPermissionError ? t('certifications.photoDenied') : t('certifications.errors.retry'));
        return;
      }
      if (!photo) return;
    }
    const ok = await run(async () => {
      const store = useCertificationsStore.getState();
      const added = await store.addCredit({
        CertificationId: id,
        CreditDate: date.value,
        Hours: hours,
        Category: creditCategory.trim() || null,
        Description: creditNote.trim() || null,
        FileData: photo?.base64 ?? null,
        FileName: photo?.name ?? null,
        FileType: photo?.contentType ?? null,
      });
      // The record's hour total changes with the entry.
      if (added) await store.fetchCertification(id, { bypassCache: true });
      return added;
    }, 'certifications.creditAdded');
    if (ok) {
      setCreditHours('');
      setCreditDate('');
      setCreditCategory('');
      setCreditNote('');
    }
  };

  const remove = async () => {
    if (!id) return;
    setIsBusy(true);
    setErrorText(null);
    try {
      if (await useCertificationsStore.getState().remove(id)) {
        setConfirmRemove(false);
        goBack();
        return;
      }
      setErrorText(failureText());
    } finally {
      setIsBusy(false);
    }
    setConfirmRemove(false);
  };

  const title = detail ? certificationName(detail, t('certifications.title')) : t('certifications.title');

  return (
    <View className="flex-1 bg-background-0" testID="certification-detail-screen">
      <ScreenHeader title={title} onBack={goBack} testID="certification-header" />
      {!id ? (
        <ZeroState isError heading={t('certifications.errors.denied')} testID="certification-invalid" />
      ) : !detail ? (
        isLoading ? (
          <Loading />
        ) : (
          <ZeroState isError heading={t('common.error')} description={loadError ? t(certificationErrorKey(loadError)) : t('certifications.errors.denied')} testID="certification-missing" />
        )
      ) : (
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" testID="certification-detail">
          <VStack space="md">
            <VStack space="xs">
              <Text className="font-semibold" testID="certification-status">
                {t(`certifications.status.${detail.Status}`)}
              </Text>
              {detail.StatusReason ? <Text className="text-typography-500">{detail.StatusReason}</Text> : null}
              {detail.Number ? <Text>{t('certifications.numberIs', { number: detail.Number })}</Text> : null}
              {detail.IssuedBy ? <Text>{t('certifications.issuedByIs', { name: detail.IssuedBy })}</Text> : null}
              {detail.Area ? <Text>{t('certifications.areaIs', { area: detail.Area })}</Text> : null}
              {detail.ReceivedOn ? <Text>{t('certifications.receivedOn', { date: dayOf(detail.ReceivedOn) })}</Text> : null}
              <Text className={expiryTone(detail.DaysUntilExpiry, detail.Status)} testID="certification-expiry">
                {expiryText(detail)}
              </Text>
              <Text className="text-typography-500">{detail.VerifiedOn ? t('certifications.verifiedOn', { date: dayOf(detail.VerifiedOn) }) : t('certifications.notVerified')}</Text>
              {detail.HasFile ? <Text className="text-typography-500">{t('certifications.hasFile')}</Text> : null}
            </VStack>

            {message ? (
              <Text className="text-typography-600" accessibilityLiveRegion="polite" testID="certification-message">
                {message}
              </Text>
            ) : null}
            {errorText ? (
              <Text className="text-error-600" accessibilityRole="alert" testID="certification-error">
                {errorText}
              </Text>
            ) : null}

            <HStack space="sm">
              <Button variant="outline" size="sm" onPress={() => router.push(certificationsRoutes.edit(detail.Id))} testID="certification-edit">
                <ButtonText>{t('certifications.edit')}</ButtonText>
              </Button>
              <Button variant="outline" action="negative" size="sm" onPress={() => setConfirmRemove(true)} isDisabled={isBusy} testID="certification-remove">
                <ButtonText>{t('certifications.remove')}</ButtonText>
              </Button>
            </HStack>

            <VStack space="sm" className="rounded-lg border border-outline-200 p-3" testID="certification-renew">
              <Text className="font-semibold">{t('certifications.renew')}</Text>
              <DateTimeField value={renewTo} onChange={setRenewTo} label={t('certifications.newExpiry')} testID="certification-renew-date" />
              <Input>
                <InputField
                  value={renewNumber}
                  onChangeText={setRenewNumber}
                  placeholder={t('certifications.newNumber')}
                  maxLength={100}
                  accessibilityLabel={t('certifications.newNumber')}
                  testID="certification-renew-number"
                />
              </Input>
              <Button variant="outline" onPress={() => void renew()} isDisabled={isBusy} testID="certification-renew-save">
                <ButtonText>{t('certifications.renewSave')}</ButtonText>
              </Button>
            </VStack>

            <VStack space="sm" className="rounded-lg border border-outline-200 p-3" testID="certification-credits">
              <Text className="font-semibold">
                {detail.CreditHoursRequired ? t('certifications.credits', { hours: detail.CreditHours, required: detail.CreditHoursRequired }) : t('certifications.creditsTitle', { hours: detail.CreditHours })}
              </Text>
              {credits.map((credit) => (
                <Text key={credit.Id} className="text-typography-500" testID={`certification-credit-${credit.Id}`}>
                  {[dayOf(credit.CreditDate), `${credit.Hours} h`, credit.Category, credit.Description, credit.HasFile ? t('certifications.certificateAttached') : null].filter(Boolean).join(' · ')}
                </Text>
              ))}
              <HStack space="sm">
                <Input style={styles.hours}>
                  <InputField
                    value={creditHours}
                    onChangeText={setCreditHours}
                    keyboardType="decimal-pad"
                    placeholder={t('certifications.hours')}
                    accessibilityLabel={t('certifications.hours')}
                    testID="certification-credit-hours"
                  />
                </Input>
                <View style={styles.flex}>
                  <DateTimeField value={creditDate} onChange={setCreditDate} label={t('certifications.creditDate')} testID="certification-credit-date" />
                </View>
              </HStack>
              <Input>
                <InputField
                  value={creditCategory}
                  onChangeText={setCreditCategory}
                  placeholder={t('certifications.category')}
                  maxLength={100}
                  accessibilityLabel={t('certifications.category')}
                  testID="certification-credit-category"
                />
              </Input>
              <Input>
                <InputField
                  value={creditNote}
                  onChangeText={setCreditNote}
                  placeholder={t('certifications.creditNote')}
                  maxLength={500}
                  accessibilityLabel={t('certifications.creditNote')}
                  testID="certification-credit-note"
                />
              </Input>
              <HStack space="sm" className="flex-wrap">
                <Button variant="outline" size="sm" onPress={() => void addCredit(false)} isDisabled={isBusy || !creditHours.trim()} testID="certification-credit-save">
                  <ButtonText>{t('certifications.addHours')}</ButtonText>
                </Button>
                <Button variant="outline" size="sm" onPress={() => void addCredit(true)} isDisabled={isBusy || !creditHours.trim()} testID="certification-credit-camera">
                  <ButtonText>{t('certifications.addHoursWithPhoto')}</ButtonText>
                </Button>
              </HStack>
            </VStack>
          </VStack>
        </ScrollView>
      )}

      <ConfirmDialog
        isOpen={confirmRemove}
        title={t('certifications.removeTitle')}
        message={t('certifications.removeBody')}
        confirmLabel={t('certifications.remove')}
        cancelLabel={t('certifications.cancel')}
        destructive
        isBusy={isBusy}
        onConfirm={() => void remove()}
        onCancel={() => setConfirmRemove(false)}
        testID="certification-remove-confirm"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: 16, paddingBottom: 32 },
  hours: { width: 96 },
});
