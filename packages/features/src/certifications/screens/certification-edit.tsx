import { useCertificationsStore } from '@resgrid/data';
import { goBackOr, OptionSheet } from '@resgrid/features/auth-ui';
import { useTranslation } from '@resgrid/i18n';
import type { Certification } from '@resgrid/models';
import { Button, ButtonSpinner, ButtonText, DateTimeField, HStack, Input, InputField, Loading, Pressable, ScreenHeader, ScrollView, Text, View, VStack, ZeroState } from '@resgrid/ui';
import { router, useLocalSearchParams } from 'expo-router';
import { ChevronDown } from 'lucide-react-native';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { StyleSheet } from 'react-native';

import { type CapturedPhoto, capturePhoto, PhotoPermissionError } from '../lib/capture-photo';
import { certificationErrorKey, dayOf, optionalDate } from '../lib/certification-format';
import { certificationsRoutes, parseCertificationId } from '../routes';

export interface CertificationEditScreenProps {
  /** Edit this record; defaults to the `id` query parameter; none = add. */
  certificationId?: number;
}

/** "Other": no catalog type, the member names it. */
const OTHER = 'other';

/**
 * Add or edit one of the member's own certifications (Responder): pick it from the department's catalog (or name it),
 * enter the number, issuer and dates, and attach a photo of the card. A catalog entry with a default validity lets the
 * server work out a blank expiry. Opened on a record the list does not hold (a deep link), it reads the record first,
 * so edit mode never falls back to an "add" form whose save would create a second certification.
 */
export default function CertificationEditScreen({ certificationId }: CertificationEditScreenProps) {
  const { t } = useTranslation();
  const params = useLocalSearchParams<{ id?: string }>();
  const hasIdParam = certificationId !== undefined || (params.id !== undefined && params.id !== '');
  const id = certificationId ?? parseCertificationId(params.id);
  const existing = useCertificationsStore((state) => (id ? (state.certificationsById[id] ?? state.certifications.find((item) => item.Id === id)) : undefined));
  const isLoading = useCertificationsStore((state) => state.loading.detail === true);
  const loadError = useCertificationsStore((state) => state.errors.detail ?? null);
  const goBack = useCallback(() => goBackOr(id ? certificationsRoutes.detail(id) : certificationsRoutes.list()), [id]);

  useEffect(() => {
    const store = useCertificationsStore.getState();
    if (store.types.length === 0) void store.fetchTypes({ appliesTo: 0 });
    if (id && !store.certificationsById[id] && !store.certifications.some((item) => item.Id === id)) void store.fetchCertification(id);
  }, [id]);

  const title = hasIdParam ? t('certifications.edit') : t('certifications.add');

  if (hasIdParam && !existing) {
    return (
      <View className="flex-1 bg-background-0" testID="certification-edit-screen">
        <ScreenHeader title={title} onBack={goBack} testID="certification-edit-header" />
        {id && (isLoading || !loadError) ? (
          <Loading />
        ) : (
          <ZeroState isError heading={t('common.error')} description={loadError ? t(certificationErrorKey(loadError)) : t('certifications.errors.denied')} testID="certification-edit-error" />
        )}
      </View>
    );
  }

  // Keyed by the record so the fields are seeded from it once it is known.
  return <CertificationForm key={existing ? String(existing.Id) : 'new'} existing={existing} title={title} onBack={goBack} />;
}

interface CertificationFormProps {
  existing?: Certification;
  title: string;
  onBack: () => void;
}

const CertificationForm: React.FC<CertificationFormProps> = ({ existing, title, onBack }) => {
  const { t } = useTranslation();
  const types = useCertificationsStore((state) => state.types);
  const [typeId, setTypeId] = useState(existing?.TypeId ? String(existing.TypeId) : OTHER);
  const [isTypeSheetOpen, setIsTypeSheetOpen] = useState(false);
  const [name, setName] = useState(existing?.Name ?? '');
  const [number, setNumber] = useState(existing?.Number ?? '');
  const [issuedBy, setIssuedBy] = useState(existing?.IssuedBy ?? '');
  const [area, setArea] = useState(existing?.Area ?? '');
  const [receivedOn, setReceivedOn] = useState(dayOf(existing?.ReceivedOn));
  const [expiresOn, setExpiresOn] = useState(dayOf(existing?.ExpiresOn));
  const [photo, setPhoto] = useState<CapturedPhoto | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const typeOptions = useMemo(
    () => [{ value: OTHER, label: t('certifications.form.otherType') }, ...types.filter((type) => type.IsActive || String(type.Id) === typeId).map((type) => ({ value: String(type.Id), label: type.Name }))],
    [t, typeId, types]
  );
  const typeLabel = typeOptions.find((option) => option.value === typeId)?.label ?? existing?.TypeName ?? t('certifications.form.otherType');

  const pick = async (source: 'camera' | 'library') => {
    try {
      const next = await capturePhoto(source, 'certificate.jpg');
      if (next) setPhoto(next);
    } catch (failure) {
      setMessage(failure instanceof PhotoPermissionError ? t('certifications.photoDenied') : t('certifications.errors.retry'));
    }
  };

  const save = async () => {
    if (isSaving) return;
    const received = optionalDate(receivedOn);
    const expires = optionalDate(expiresOn);
    if (!received.ok || !expires.ok) {
      setMessage(t('certifications.dateInvalid'));
      return;
    }
    if (typeId === OTHER && !name.trim()) {
      setMessage(t('certifications.nameRequired'));
      return;
    }
    setIsSaving(true);
    setMessage(null);
    try {
      const store = useCertificationsStore.getState();
      const saved = await store.save({
        Id: existing?.Id ?? null,
        TypeId: typeId === OTHER ? null : Number(typeId),
        Name: name.trim() || null,
        Number: number.trim() || null,
        IssuedBy: issuedBy.trim() || null,
        Area: area.trim() || null,
        ReceivedOn: received.value,
        ExpiresOn: expires.value,
        FileData: photo?.base64 ?? null,
        FileName: photo?.name ?? null,
        FileType: photo?.contentType ?? null,
      });
      if (saved) {
        router.replace(certificationsRoutes.detail(saved.Id));
        return;
      }
      const failure = useCertificationsStore.getState().actionError;
      setMessage(failure ? t(certificationErrorKey(failure)) : t('certifications.errors.retry'));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <View className="flex-1 bg-background-0" testID="certification-edit-screen">
      <ScreenHeader title={title} onBack={onBack} testID="certification-edit-header" />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <VStack space="md">
          <Text className="font-semibold">{t('certifications.form.type')}</Text>
          <Pressable
            onPress={() => setIsTypeSheetOpen(true)}
            accessibilityRole="button"
            accessibilityLabel={`${t('certifications.form.type')}: ${typeLabel}`}
            className="rounded-lg border border-outline-200 px-3 py-3"
            testID="certification-type"
          >
            <HStack className="items-center justify-between">
              <Text className="flex-1 text-typography-900">{typeLabel}</Text>
              <ChevronDown size={18} color="#6b7280" />
            </HStack>
          </Pressable>
          {typeId === OTHER ? (
            <Input>
              <InputField value={name} onChangeText={setName} placeholder={t('certifications.form.name')} maxLength={200} accessibilityLabel={t('certifications.form.name')} testID="certification-name" />
            </Input>
          ) : null}
          <Input>
            <InputField value={number} onChangeText={setNumber} placeholder={t('certifications.form.number')} maxLength={100} accessibilityLabel={t('certifications.form.number')} testID="certification-number" />
          </Input>
          <Input>
            <InputField
              value={issuedBy}
              onChangeText={setIssuedBy}
              placeholder={t('certifications.form.issuedBy')}
              maxLength={200}
              accessibilityLabel={t('certifications.form.issuedBy')}
              testID="certification-issued-by"
            />
          </Input>
          <Input>
            <InputField value={area} onChangeText={setArea} placeholder={t('certifications.form.area')} maxLength={200} accessibilityLabel={t('certifications.form.area')} testID="certification-area" />
          </Input>
          <DateTimeField value={receivedOn} onChange={setReceivedOn} label={t('certifications.form.receivedOn')} testID="certification-received" />
          <DateTimeField value={expiresOn} onChange={setExpiresOn} label={t('certifications.form.expiresOn')} testID="certification-expires" />
          <HStack space="sm">
            <Button variant="outline" size="sm" onPress={() => void pick('camera')} testID="certification-camera">
              <ButtonText>{t('certifications.form.takePhoto')}</ButtonText>
            </Button>
            <Button variant="outline" size="sm" onPress={() => void pick('library')} testID="certification-library">
              <ButtonText>{t('certifications.form.choosePhoto')}</ButtonText>
            </Button>
          </HStack>
          {photo ? (
            <Text className="text-typography-500" testID="certification-photo-attached">
              {t('certifications.form.photoAttached')}
            </Text>
          ) : existing?.HasFile ? (
            <Text className="text-typography-500">{t('certifications.hasFile')}</Text>
          ) : null}
          {message ? (
            <Text className="text-error-600" accessibilityRole="alert" testID="certification-form-message">
              {message}
            </Text>
          ) : null}
          <Button onPress={() => void save()} isDisabled={isSaving} testID="certification-save">
            {isSaving ? <ButtonSpinner /> : <ButtonText>{t('certifications.form.save')}</ButtonText>}
          </Button>
        </VStack>
      </ScrollView>

      <OptionSheet
        isOpen={isTypeSheetOpen}
        onClose={() => setIsTypeSheetOpen(false)}
        title={t('certifications.form.type')}
        options={typeOptions}
        selected={typeId}
        onSelect={(value) => {
          setTypeId(value);
          setIsTypeSheetOpen(false);
        }}
        testID="certification-type-sheet"
      />
    </View>
  );
};

const styles = StyleSheet.create({
  content: { padding: 16, paddingBottom: 32 },
});
