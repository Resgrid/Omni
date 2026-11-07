import { pushRoutePath } from '@resgrid/core/navigation/route-paths';
import { useCertificationsStore } from '@resgrid/data';
import { ConfirmDialog, goBackOr } from '@resgrid/features/auth-ui';
import { useTranslation } from '@resgrid/i18n';
import type { Certification, CertificationCredit } from '@resgrid/models';
import {
  Button,
  ButtonSpinner,
  ButtonText,
  DateTimeField,
  HStack,
  Input,
  InputField,
  KeyboardAwareScrollView,
  Loading,
  Progress,
  ProgressFilledTrack,
  ScreenHeader,
  showToast,
  Text,
  useThemeColors,
  View,
  VStack,
  ZeroState,
} from '@resgrid/ui';
import { router, useLocalSearchParams } from 'expo-router';
import { Award, Building2, CalendarCheck, CalendarClock, Camera, FileCheck, GraduationCap, Hash, Layers, type LucideIcon, Paperclip, Pencil, RefreshCw, ShieldCheck, Trash2 } from 'lucide-react-native';
import React, { useCallback, useEffect, useState } from 'react';
import { StyleSheet } from 'react-native';

import { FormAlert } from '../components/form-alert';
import { FormField } from '../components/form-field';
import { SectionCard } from '../components/section-card';
import { CertificationStatusBadge } from '../components/status-badge';
import { useExpiryText } from '../hooks/use-expiry-text';
import { type CapturedPhoto, capturePhoto, PhotoPermissionError } from '../lib/capture-photo';
import { certificationErrorKey, certificationName, dayOf, expiryState, expiryTextClass, formatDay, hoursOf, optionalDate } from '../lib/certification-format';
import { certificationsRoutes, parseCertificationId } from '../routes';

export interface CertificationDetailScreenProps {
  /** Defaults to the `id` route parameter. */
  certificationId?: number;
}

const EMPTY_CREDITS: readonly CertificationCredit[] = [];

type Scope = 'record' | 'renew' | 'credit';

interface Feedback {
  scope: Scope;
  tone: 'success' | 'error';
  title?: string;
  message: string;
}

/**
 * One certification (Responder): dates and status, the department's verification, renewal, and the continuing-education
 * hours logged toward it (an optional certificate photo per entry). Changes are online only; each result shows in the
 * section it came from, and a failure keeps what the member typed.
 */
export default function CertificationDetailScreen({ certificationId }: CertificationDetailScreenProps) {
  const { t, i18n } = useTranslation();
  const locale = i18n?.language ?? 'en';
  const colors = useThemeColors();
  const params = useLocalSearchParams<{ id?: string }>();
  const id = certificationId ?? parseCertificationId(params.id);
  const detail = useCertificationsStore((state) => (id ? (state.certificationsById[id] ?? state.certifications.find((item) => item.Id === id)) : undefined));
  const credits = useCertificationsStore((state) => (id ? (state.creditsByCertification[id] ?? EMPTY_CREDITS) : EMPTY_CREDITS));
  const types = useCertificationsStore((state) => state.types);
  const isLoading = useCertificationsStore((state) => state.loading.detail === true);
  const loadError = useCertificationsStore((state) => state.errors.detail ?? null);
  const expiryText = useExpiryText();
  const [renewTo, setRenewTo] = useState('');
  const [renewNumber, setRenewNumber] = useState('');
  const [creditDate, setCreditDate] = useState('');
  const [creditHours, setCreditHours] = useState('');
  const [creditCategory, setCreditCategory] = useState('');
  const [creditNote, setCreditNote] = useState('');
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [busy, setBusy] = useState<Scope | 'photo' | null>(null);
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
    return t(failure ? certificationErrorKey(failure) : 'errors.data.unknown');
  }, [t]);

  const run = async (scope: Scope, work: () => Promise<boolean>, successKey: string, failedTitleKey: string): Promise<boolean> => {
    if (busy) return false;
    setBusy(scope);
    setFeedback(null);
    try {
      const ok = await work();
      setFeedback(ok ? { scope, tone: 'success', message: t(successKey) } : { scope, tone: 'error', title: t(failedTitleKey), message: failureText() });
      return ok;
    } finally {
      setBusy(null);
    }
  };

  const invalid = (scope: Scope, messageKey: string, options?: Record<string, unknown>) => setFeedback({ scope, tone: 'error', message: t(messageKey, options) });

  const renew = async (record: Certification) => {
    const date = optionalDate(renewTo);
    if (!date.ok) return invalid('renew', 'certifications.dateInvalid');
    const type = record.TypeId ? types.find((item) => item.Id === record.TypeId) : undefined;
    // Core needs a date for anything that expires; a renewal without one would clear the expiry.
    if (!date.value && (record.ExpiresOn || (type && !type.NeverExpires))) return invalid('renew', 'certifications.errors.expiryRequired');
    if (date.value && record.ExpiresOn && expiryState(record) !== 'expired' && date.value <= dayOf(record.ExpiresOn))
      return invalid('renew', 'certifications.renewExpiryNotLater', { date: formatDay(record.ExpiresOn, locale) });
    const ok = await run(
      'renew',
      async () => (await useCertificationsStore.getState().renew({ Id: record.Id, ExpiresOn: date.value, Number: renewNumber.trim() || null })) !== null,
      'certifications.renewed',
      'certifications.renewFailedTitle'
    );
    if (ok) {
      setRenewTo('');
      setRenewNumber('');
    }
  };

  const addCredit = async (record: Certification, withPhoto: boolean) => {
    const hours = hoursOf(creditHours);
    if (hours === null) return invalid('credit', 'certifications.hoursInvalid');
    const date = optionalDate(creditDate);
    if (!date.ok) return invalid('credit', 'certifications.dateInvalid');
    let photo: CapturedPhoto | null = null;
    if (withPhoto) {
      setBusy('photo');
      try {
        photo = await capturePhoto('camera', 'ce-certificate.jpg');
      } catch (failure) {
        return invalid('credit', failure instanceof PhotoPermissionError ? 'certifications.photoDenied' : 'certifications.photoFailed');
      } finally {
        setBusy(null);
      }
      if (!photo) return;
    }
    const ok = await run(
      'credit',
      async () => {
        const store = useCertificationsStore.getState();
        const added = await store.addCredit({
          CertificationId: record.Id,
          CreditDate: date.value,
          Hours: hours,
          Category: creditCategory.trim() || null,
          Description: creditNote.trim() || null,
          FileData: photo?.base64 ?? null,
          FileName: photo?.name ?? null,
          FileType: photo?.contentType ?? null,
        });
        // The record's hour total changes with the entry.
        if (added) await store.fetchCertification(record.Id, { bypassCache: true });
        return added;
      },
      'certifications.creditAdded',
      'certifications.creditFailedTitle'
    );
    if (ok) {
      setCreditHours('');
      setCreditDate('');
      setCreditCategory('');
      setCreditNote('');
    }
  };

  const remove = async () => {
    if (!id) return;
    setBusy('record');
    setFeedback(null);
    try {
      if (await useCertificationsStore.getState().remove(id)) {
        setConfirmRemove(false);
        showToast('success', t('certifications.removed'));
        goBack();
        return;
      }
      setFeedback({ scope: 'record', tone: 'error', title: t('certifications.removeFailedTitle'), message: failureText() });
    } finally {
      setBusy(null);
    }
    setConfirmRemove(false);
  };

  const feedbackFor = (scope: Scope) =>
    feedback?.scope === scope ? (
      <View className="mb-3">
        <FormAlert tone={feedback.tone} title={feedback.title} message={feedback.message} testID={feedback.tone === 'error' ? 'certification-error' : 'certification-message'} />
      </View>
    ) : null;

  const title = detail ? certificationName(detail, t('certifications.title')) : t('certifications.title');

  return (
    <View className="flex-1 bg-background-50" testID="certification-detail-screen">
      <ScreenHeader title={title} onBack={goBack} testID="certification-header" />
      {!id ? (
        <ZeroState isError heading={t('certifications.loadOneFailed')} description={t('certifications.errors.notFound')} testID="certification-invalid" />
      ) : !detail ? (
        isLoading ? (
          <Loading />
        ) : (
          <ZeroState
            isError
            heading={t('certifications.loadOneFailed')}
            description={t(loadError ? certificationErrorKey(loadError) : 'certifications.errors.notFound')}
            onRetry={async () => {
              await useCertificationsStore.getState().fetchCertification(id, { bypassCache: true });
            }}
            testID="certification-missing"
          >
            <Button className="mt-4" variant="outline" onPress={goBack} testID="certification-missing-back">
              <ButtonText>{t('certifications.backToList')}</ButtonText>
            </Button>
          </ZeroState>
        )
      ) : (
        <KeyboardAwareScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" testID="certification-detail">
          <Summary record={detail} expiry={expiryText(detail)} />

          {feedbackFor('record')}

          <HStack space="sm" className="mb-3">
            <Button variant="outline" className="flex-1 bg-background-0" onPress={() => pushRoutePath(router, certificationsRoutes.edit(detail.Id))} testID="certification-edit">
              <View style={styles.buttonIcon}>
                <Pencil size={16} color={colors.primaryStrong} />
              </View>
              <ButtonText>{t('certifications.edit')}</ButtonText>
            </Button>
            <Button variant="outline" action="negative" className="flex-1 bg-background-0" onPress={() => setConfirmRemove(true)} isDisabled={busy !== null} testID="certification-remove">
              <View style={styles.buttonIcon}>
                <Trash2 size={16} color={colors.primary} />
              </View>
              <ButtonText>{t('certifications.remove')}</ButtonText>
            </Button>
          </HStack>

          <SectionCard title={t('certifications.details')} testID="certification-details">
            <DetailRow icon={Hash} label={t('certifications.form.number')} value={detail.Number} />
            <DetailRow icon={Building2} label={t('certifications.form.issuedBy')} value={detail.IssuedBy} />
            <DetailRow icon={Layers} label={t('certifications.form.area')} value={detail.Area} />
            <DetailRow icon={CalendarCheck} label={t('certifications.form.receivedOn')} value={detail.ReceivedOn ? formatDay(detail.ReceivedOn, locale) : null} />
            <DetailRow
              icon={ShieldCheck}
              label={t('certifications.verification')}
              value={detail.VerifiedOn ? t('certifications.verifiedOn', { date: formatDay(detail.VerifiedOn, locale) }) : t('certifications.notVerified')}
              testID="certification-verification"
            />
            <DetailRow icon={FileCheck} label={t('certifications.document')} value={detail.HasFile ? t('certifications.onFile') : t('certifications.noFile')} last />
          </SectionCard>

          <SectionCard title={t('certifications.renew')} icon={RefreshCw} description={t('certifications.renewHint')} testID="certification-renew">
            {feedbackFor('renew')}
            <FormField>
              <DateTimeField value={renewTo} onChange={setRenewTo} label={t('certifications.newExpiry')} testID="certification-renew-date" />
            </FormField>
            <FormField label={t('certifications.newNumber')} optional>
              <Input>
                <InputField
                  value={renewNumber}
                  onChangeText={setRenewNumber}
                  placeholder={detail.Number ?? ''}
                  maxLength={100}
                  autoCapitalize="characters"
                  autoCorrect={false}
                  accessibilityLabel={t('certifications.newNumber')}
                  testID="certification-renew-number"
                />
              </Input>
            </FormField>
            <Button onPress={() => void renew(detail)} isDisabled={busy !== null} testID="certification-renew-save">
              {busy === 'renew' ? <ButtonSpinner color={colors.textInverse} /> : <ButtonText>{t('certifications.renewSave')}</ButtonText>}
            </Button>
          </SectionCard>

          <SectionCard title={t('certifications.ceTitle')} icon={GraduationCap} testID="certification-credits">
            <CreditProgress record={detail} />
            {credits.length === 0 ? (
              <Text size="sm" className="mb-3 text-typography-500" testID="certification-credits-empty">
                {t('certifications.ceNone')}
              </Text>
            ) : (
              <VStack className="mb-3">
                {credits.map((credit, index) => (
                  <CreditRow key={credit.Id} credit={credit} locale={locale} last={index === credits.length - 1} />
                ))}
              </VStack>
            )}

            <View className="rounded-lg bg-background-50 p-3">
              <Text className="mb-3 font-semibold text-typography-900">{t('certifications.logHours')}</Text>
              {feedbackFor('credit')}
              <FormField label={t('certifications.hours')}>
                <Input className="bg-background-0">
                  <InputField value={creditHours} onChangeText={setCreditHours} keyboardType="decimal-pad" placeholder="1.5" accessibilityLabel={t('certifications.hours')} testID="certification-credit-hours" />
                </Input>
              </FormField>
              <FormField>
                <DateTimeField value={creditDate} onChange={setCreditDate} label={t('certifications.creditDate')} testID="certification-credit-date" />
              </FormField>
              <FormField label={t('certifications.categoryLabel')} optional>
                <Input className="bg-background-0">
                  <InputField
                    value={creditCategory}
                    onChangeText={setCreditCategory}
                    placeholder={t('certifications.category')}
                    maxLength={100}
                    accessibilityLabel={t('certifications.categoryLabel')}
                    testID="certification-credit-category"
                  />
                </Input>
              </FormField>
              <FormField label={t('certifications.creditNote')} optional>
                <Input className="bg-background-0">
                  <InputField
                    value={creditNote}
                    onChangeText={setCreditNote}
                    placeholder={t('certifications.creditNotePlaceholder')}
                    maxLength={500}
                    accessibilityLabel={t('certifications.creditNote')}
                    testID="certification-credit-note"
                  />
                </Input>
              </FormField>
              <VStack space="sm">
                <Button onPress={() => void addCredit(detail, false)} isDisabled={busy !== null || !creditHours.trim()} testID="certification-credit-save">
                  {busy === 'credit' ? <ButtonSpinner color={colors.textInverse} /> : <ButtonText>{t('certifications.addHours')}</ButtonText>}
                </Button>
                <Button variant="outline" className="bg-background-0" onPress={() => void addCredit(detail, true)} isDisabled={busy !== null || !creditHours.trim()} testID="certification-credit-camera">
                  <View style={styles.buttonIcon}>
                    <Camera size={16} color={colors.primaryStrong} />
                  </View>
                  <ButtonText>{t('certifications.addHoursWithPhoto')}</ButtonText>
                </Button>
              </VStack>
            </View>
          </SectionCard>
        </KeyboardAwareScrollView>
      )}

      <ConfirmDialog
        isOpen={confirmRemove}
        title={t('certifications.removeTitle')}
        message={t('certifications.removeBody')}
        confirmLabel={t('certifications.remove')}
        cancelLabel={t('certifications.cancel')}
        destructive
        isBusy={busy === 'record'}
        onConfirm={() => void remove()}
        onCancel={() => setConfirmRemove(false)}
        testID="certification-remove-confirm"
      />
    </View>
  );
}

/** The record at a glance: name, the department's status (and why), and the expiry. */
const Summary: React.FC<{ record: Certification; expiry: string }> = ({ record, expiry }) => {
  const { t } = useTranslation();
  const colors = useThemeColors();
  const state = expiryState(record);
  const accent = state === 'expired' ? colors.error : state === 'soon' ? colors.warning : colors.icon;
  const tile = state === 'expired' ? 'bg-background-error' : state === 'soon' ? 'bg-background-warning' : 'bg-background-100';
  return (
    <View className="mb-3 rounded-xl border border-outline-200 bg-background-0 p-4" testID="certification-summary">
      <HStack space="md" className="items-start">
        <View className={`size-12 items-center justify-center rounded-full ${tile}`}>
          <Award size={24} color={accent} />
        </View>
        <VStack space="xs" className="flex-1">
          <Text className="text-lg font-bold text-typography-900">{certificationName(record, t('certifications.untitled'))}</Text>
          <HStack>
            <CertificationStatusBadge status={record.Status} testID="certification-status" />
          </HStack>
          {record.StatusReason ? (
            <Text size="sm" className="text-typography-600">
              {record.StatusReason}
            </Text>
          ) : null}
          <HStack space="xs" className="mt-1 items-center">
            <View>
              <CalendarClock size={16} color={accent} />
            </View>
            <Text className={`font-medium ${expiryTextClass(state)}`} testID="certification-expiry">
              {expiry}
            </Text>
          </HStack>
        </VStack>
      </HStack>
    </View>
  );
};

const DetailRow: React.FC<{ icon: LucideIcon; label: string; value?: string | null; last?: boolean; testID?: string }> = ({ icon: Icon, label, value, last = false, testID }) => {
  const colors = useThemeColors();
  return (
    <HStack space="md" className={`items-start py-2.5 ${last ? '' : 'border-b border-outline-100'}`} testID={testID}>
      <View className="pt-0.5">
        <Icon size={16} color={colors.textMuted} />
      </View>
      <Text size="sm" className="w-28 text-typography-600">
        {label}
      </Text>
      <Text size="sm" className={`flex-1 ${value ? 'text-typography-900' : 'text-typography-400'}`}>
        {value || '—'}
      </Text>
    </HStack>
  );
};

/** Hours toward the renewal when the type sets a requirement, otherwise the total logged. */
const CreditProgress: React.FC<{ record: Certification }> = ({ record }) => {
  const { t } = useTranslation();
  const required = record.CreditHoursRequired ?? 0;
  if (required <= 0) {
    return (
      <Text className="mb-3 font-medium text-typography-900" testID="certification-credit-total">
        {t('certifications.creditsTitle', { hours: record.CreditHours })}
      </Text>
    );
  }
  const percent = Math.min(100, Math.round((record.CreditHours / required) * 100));
  return (
    <VStack space="xs" className="mb-3" testID="certification-credit-total">
      <HStack className="items-baseline justify-between">
        <Text className="font-medium text-typography-900">{t('certifications.credits', { hours: record.CreditHours, required })}</Text>
        <Text size="sm" className={percent >= 100 ? 'font-semibold text-success-700' : 'text-typography-500'}>{`${percent}%`}</Text>
      </HStack>
      <Progress value={percent} size="sm" accessibilityLabel={t('certifications.credits', { hours: record.CreditHours, required })}>
        <ProgressFilledTrack className={percent >= 100 ? 'bg-success-500' : undefined} />
      </Progress>
    </VStack>
  );
};

const CreditRow: React.FC<{ credit: CertificationCredit; locale: string; last: boolean }> = ({ credit, locale, last }) => {
  const { t } = useTranslation();
  const colors = useThemeColors();
  const what = [credit.Category, credit.Description].filter(Boolean).join(' · ');
  return (
    <HStack space="md" className={`items-center py-2.5 ${last ? '' : 'border-b border-outline-100'}`} testID={`certification-credit-${credit.Id}`}>
      <View className="min-w-14 items-center rounded-md bg-background-100 px-2 py-1">
        <Text className="font-semibold text-typography-900">{t('certifications.hoursShort', { hours: credit.Hours })}</Text>
      </View>
      <VStack className="flex-1">
        <Text size="sm" className="text-typography-900">
          {formatDay(credit.CreditDate, locale)}
        </Text>
        {what ? (
          <Text size="sm" className="text-typography-600" numberOfLines={2}>
            {what}
          </Text>
        ) : null}
      </VStack>
      {credit.HasFile ? (
        <View accessible accessibilityLabel={t('certifications.certificateAttached')}>
          <Paperclip size={16} color={colors.textMuted} />
        </View>
      ) : null}
    </HStack>
  );
};

const styles = StyleSheet.create({
  content: { padding: 16, paddingBottom: 40 },
  buttonIcon: { marginRight: 6 },
});
