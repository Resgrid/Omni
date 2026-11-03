import { useCertificationsStore } from '@resgrid/data';
import { goBackOr, OptionSheet } from '@resgrid/features/auth-ui';
import { useTranslation } from '@resgrid/i18n';
import type { Certification, CertificationType } from '@resgrid/models';
import { Button, ButtonSpinner, ButtonText, DateTimeField, HStack, Image, Input, InputField, Loading, Pressable, ScreenHeader, ScrollView, showToast, Text, useThemeColors, View, VStack, ZeroState } from '@resgrid/ui';
import { router, useLocalSearchParams } from 'expo-router';
import { Camera, ChevronDown, FileCheck, ImagePlus, X } from 'lucide-react-native';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet } from 'react-native';

import { FormAlert } from '../components/form-alert';
import { FormField } from '../components/form-field';
import { SectionCard } from '../components/section-card';
import { type CapturedPhoto, capturePhoto, PhotoPermissionError } from '../lib/capture-photo';
import { addMonths, certificationErrorKey, dayOf, MAX_PHOTO_BYTES, optionalDate, validateCertificationForm } from '../lib/certification-format';
import { certificationsRoutes, parseCertificationId } from '../routes';

export interface CertificationEditScreenProps {
  /** Edit this record; defaults to the `id` query parameter; none = add. */
  certificationId?: number;
}

/** "Other": no catalog type, the member names it. */
const OTHER = 'other';

/**
 * Add or edit one of the member's own certifications (Responder): pick it from the department's catalog (or name it),
 * enter the number, issuer and dates, and attach a photo of the card. A catalog entry with a default validity fills in
 * the expiry from the issue date. Opened on a record the list does not hold (a deep link), it reads the record first,
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

  const title = hasIdParam ? t('certifications.editTitle') : t('certifications.addTitle');

  if (hasIdParam && !existing) {
    return (
      <View className="flex-1 bg-background-50" testID="certification-edit-screen">
        <ScreenHeader title={title} onBack={goBack} testID="certification-edit-header" />
        {id && (isLoading || !loadError) ? (
          <Loading />
        ) : (
          <ZeroState isError heading={t('certifications.loadOneFailed')} description={t(loadError ? certificationErrorKey(loadError) : 'certifications.errors.notFound')} testID="certification-edit-error">
            <Button className="mt-4" variant="outline" onPress={goBack} testID="certification-edit-back">
              <ButtonText>{t('certifications.backToList')}</ButtonText>
            </Button>
          </ZeroState>
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

interface Failure {
  title: string;
  message: string;
}

const CertificationForm: React.FC<CertificationFormProps> = ({ existing, title, onBack }) => {
  const { t } = useTranslation();
  const colors = useThemeColors();
  const types = useCertificationsStore((state) => state.types);
  const typesLoading = useCertificationsStore((state) => state.loading.types === true);
  // null until the member picks one; with no catalog at all the record can only be named ("Other").
  const [pickedType, setPickedType] = useState<string | null>(existing ? (existing.TypeId ? String(existing.TypeId) : OTHER) : null);
  const typeId = pickedType ?? (types.length === 0 && !typesLoading ? OTHER : null);
  const isOther = typeId === OTHER;
  const [isTypeSheetOpen, setIsTypeSheetOpen] = useState(false);
  const [name, setName] = useState(existing?.Name ?? '');
  const [number, setNumber] = useState(existing?.Number ?? '');
  const [issuedBy, setIssuedBy] = useState(existing?.IssuedBy ?? '');
  const [area, setArea] = useState(existing?.Area ?? '');
  const [receivedOn, setReceivedOn] = useState(dayOf(existing?.ReceivedOn));
  const [expiresOn, setExpiresOn] = useState(dayOf(existing?.ExpiresOn));
  /** The expiry was filled in from the type's validity, so a new issue date may move it. */
  const [expiresAuto, setExpiresAuto] = useState(false);
  const [photo, setPhoto] = useState<CapturedPhoto | null>(null);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [typeRefused, setTypeRefused] = useState(false);
  const [failure, setFailure] = useState<Failure | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const scrollRef = useRef<React.ComponentRef<typeof ScrollView>>(null);

  const selectedType: CertificationType | undefined = typeId && !isOther ? types.find((type) => String(type.Id) === typeId) : undefined;
  const validityMonths = selectedType && !selectedType.NeverExpires ? (selectedType.DefaultValidityMonths ?? null) : null;
  const neverExpires = selectedType?.NeverExpires === true;

  const typeOptions = useMemo(
    () => [
      ...types
        .filter((type) => type.IsActive || String(type.Id) === typeId)
        .map((type) => ({ value: String(type.Id), label: type.Name, description: type.IssuingAuthority ?? undefined }))
        .sort((a, b) => a.label.localeCompare(b.label)),
      { value: OTHER, label: t('certifications.form.otherType') },
    ],
    [t, typeId, types]
  );
  const typeLabel = typeId ? (typeOptions.find((option) => option.value === typeId)?.label ?? existing?.TypeName ?? t('certifications.form.otherType')) : null;

  const errors = useMemo(() => validateCertificationForm({ isOther, hasType: typeId !== null, name, receivedOn, expiresOn: neverExpires ? '' : expiresOn }), [expiresOn, isOther, name, neverExpires, receivedOn, typeId]);
  const shown = submitted ? errors : {};
  const hasErrors = Object.keys(errors).length > 0;
  const typeError = shown.type ? t(shown.type) : typeRefused ? t('certifications.errors.typeUnavailable') : null;

  /** A blank (or auto-filled) expiry follows the issue date when the type says how long it is valid. */
  const suggestExpiry = (months: number | null, received: string) => {
    if (!months || !received || !(expiresOn === '' || expiresAuto)) return;
    setExpiresOn(addMonths(received, months));
    setExpiresAuto(true);
  };

  const chooseType = (value: string) => {
    setPickedType(value);
    setTypeRefused(false);
    setIsTypeSheetOpen(false);
    const type = value === OTHER ? undefined : types.find((item) => String(item.Id) === value);
    if (expiresAuto && !type?.DefaultValidityMonths) {
      setExpiresOn('');
      setExpiresAuto(false);
    }
    if (type && !type.NeverExpires) suggestExpiry(type.DefaultValidityMonths ?? null, receivedOn);
  };

  const changeReceived = (value: string) => {
    setReceivedOn(value);
    suggestExpiry(validityMonths, value);
  };

  const changeExpires = (value: string) => {
    setExpiresOn(value);
    setExpiresAuto(false);
  };

  const pick = async (source: 'camera' | 'library') => {
    setPhotoError(null);
    try {
      const next = await capturePhoto(source, 'certificate.jpg');
      if (!next) return;
      if (Math.floor((next.base64.length * 3) / 4) > MAX_PHOTO_BYTES) {
        setPhotoError(t('certifications.errors.certifications_file_too_large'));
        return;
      }
      setPhoto(next);
    } catch (problem) {
      setPhotoError(problem instanceof PhotoPermissionError ? t('certifications.photoDenied') : t('certifications.photoFailed'));
    }
  };

  const save = async () => {
    if (isSaving) return;
    setSubmitted(true);
    setFailure(null);
    if (hasErrors) {
      // The certification and its name are the first card; bring them into view when they are what needs fixing.
      if (errors.type || errors.name) scrollRef.current?.scrollTo({ y: 0, animated: true });
      return;
    }
    setIsSaving(true);
    try {
      const store = useCertificationsStore.getState();
      const saved = await store.save({
        Id: existing?.Id ?? 0,
        TypeId: isOther ? null : Number(typeId),
        Name: isOther ? name.trim() : null,
        Number: number.trim() || null,
        IssuedBy: issuedBy.trim() || null,
        Area: area.trim() || null,
        ReceivedOn: optionalDate(receivedOn).value,
        ExpiresOn: neverExpires ? null : optionalDate(expiresOn).value,
        FileData: photo?.base64 ?? null,
        FileName: photo?.name ?? null,
        FileType: photo?.contentType ?? null,
      });
      if (saved) {
        showToast('success', t('certifications.saved'));
        router.replace(certificationsRoutes.detail(saved.Id));
        return;
      }
      const error = useCertificationsStore.getState().actionError;
      const reason = error?.problemType ?? '';
      // Point at the field Core refused, as well as saying so.
      if (reason === 'certifications_type_not_found' || reason === 'certifications_type_scope') {
        setTypeRefused(true);
        scrollRef.current?.scrollTo({ y: 0, animated: true });
      }
      if (reason === 'certifications_file_invalid' || reason === 'certifications_file_too_large') setPhotoError(t(`certifications.errors.${reason}`));
      setFailure({ title: t('certifications.saveFailedTitle'), message: t(error ? certificationErrorKey(error) : 'errors.data.unknown') });
    } finally {
      setIsSaving(false);
    }
  };

  const typeHint = [neverExpires ? t('certifications.form.neverExpiresHint') : null, selectedType?.RequiresVerification ? t('certifications.form.verificationHint') : null].filter(Boolean).join(' ');
  const expiresHint = expiresAuto && validityMonths ? t('certifications.form.expiresAuto', { months: validityMonths }) : validityMonths ? t('certifications.form.validityHint', { months: validityMonths }) : null;

  return (
    <View className="flex-1 bg-background-50" testID="certification-edit-screen">
      <ScreenHeader title={title} onBack={onBack} testID="certification-edit-header" />
      <ScrollView ref={scrollRef} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets testID="certification-edit-form">
        <SectionCard testID="certification-section-type">
          <FormField label={t('certifications.form.type')} hint={typeHint || null} error={typeError} last={!isOther} testID="certification-type-field">
            <Pressable
              onPress={() => setIsTypeSheetOpen(true)}
              accessibilityRole="button"
              accessibilityLabel={`${t('certifications.form.type')}: ${typeLabel ?? t('certifications.form.choose')}`}
              className={`min-h-11 justify-center rounded border bg-background-0 px-3 py-2 ${typeError ? 'border-error-700' : 'border-outline-300'}`}
              testID="certification-type"
            >
              <HStack space="sm" className="items-center">
                <Text className={`flex-1 ${typeLabel ? 'text-typography-900' : 'text-typography-500'}`} numberOfLines={1}>
                  {typeLabel ?? t('certifications.form.choose')}
                </Text>
                <View>
                  <ChevronDown size={18} color={colors.textMuted} />
                </View>
              </HStack>
            </Pressable>
          </FormField>
          {isOther ? (
            <FormField label={t('certifications.form.name')} error={shown.name ? t(shown.name) : null} last testID="certification-name-field">
              <Input isInvalid={!!shown.name}>
                <InputField
                  value={name}
                  onChangeText={setName}
                  placeholder={t('certifications.form.namePlaceholder')}
                  maxLength={200}
                  autoCapitalize="words"
                  accessibilityLabel={t('certifications.form.name')}
                  testID="certification-name"
                />
              </Input>
            </FormField>
          ) : null}
        </SectionCard>

        <SectionCard title={t('certifications.form.sectionDetails')} testID="certification-section-details">
          <FormField label={t('certifications.form.number')} optional>
            <Input>
              <InputField
                value={number}
                onChangeText={setNumber}
                placeholder={t('certifications.form.numberPlaceholder')}
                maxLength={100}
                autoCapitalize="characters"
                autoCorrect={false}
                accessibilityLabel={t('certifications.form.number')}
                testID="certification-number"
              />
            </Input>
          </FormField>
          <FormField label={t('certifications.form.issuedBy')} optional>
            <Input>
              <InputField
                value={issuedBy}
                onChangeText={setIssuedBy}
                placeholder={selectedType?.IssuingAuthority || t('certifications.form.issuedByPlaceholder')}
                maxLength={200}
                accessibilityLabel={t('certifications.form.issuedBy')}
                testID="certification-issued-by"
              />
            </Input>
          </FormField>
          <FormField label={t('certifications.form.area')} optional last>
            <Input>
              <InputField value={area} onChangeText={setArea} placeholder={t('certifications.form.areaPlaceholder')} maxLength={200} accessibilityLabel={t('certifications.form.area')} testID="certification-area" />
            </Input>
          </FormField>
        </SectionCard>

        <SectionCard title={t('certifications.form.sectionDates')} testID="certification-section-dates">
          {/* Date fields label themselves (the label is the placeholder, then a caption above the date). */}
          <FormField error={shown.receivedOn ? t(shown.receivedOn) : null} testID="certification-received-field">
            <DateTimeField value={receivedOn} onChange={changeReceived} label={t('certifications.form.receivedOn')} testID="certification-received" />
          </FormField>
          {neverExpires ? (
            <Text size="sm" className="text-typography-600" testID="certification-never-expires">
              {t('certifications.form.neverExpiresHint')}
            </Text>
          ) : (
            <FormField hint={expiresHint} error={shown.expiresOn ? t(shown.expiresOn) : null} last testID="certification-expires-field">
              <DateTimeField value={expiresOn} onChange={changeExpires} label={t('certifications.form.expiresOn')} testID="certification-expires" />
            </FormField>
          )}
        </SectionCard>

        <SectionCard title={t('certifications.form.sectionPhoto')} description={t('certifications.form.photoHint')} testID="certification-section-photo">
          {photo ? (
            <HStack space="md" className="mb-3 items-center rounded-lg border border-outline-200 p-2" testID="certification-photo-attached">
              <Image source={{ uri: `data:${photo.contentType};base64,${photo.base64}` }} className="size-14 rounded-md" contentFit="cover" accessibilityLabel={t('certifications.form.photoAttached')} />
              <Text size="sm" className="flex-1 text-typography-700">
                {t('certifications.form.photoAttached')}
              </Text>
              <Pressable onPress={() => setPhoto(null)} accessibilityRole="button" accessibilityLabel={t('certifications.form.removePhoto')} className="rounded-full p-2" testID="certification-photo-remove">
                <X size={18} color={colors.textMuted} />
              </Pressable>
            </HStack>
          ) : existing?.HasFile ? (
            <HStack space="sm" className="mb-3 items-center">
              <View>
                <FileCheck size={16} color={colors.success} />
              </View>
              <Text size="sm" className="flex-1 text-typography-700" testID="certification-photo-on-file">
                {t('certifications.hasFile')}
              </Text>
            </HStack>
          ) : null}
          <HStack space="sm">
            <Button variant="outline" className="flex-1" onPress={() => void pick('camera')} testID="certification-camera">
              <View style={styles.buttonIcon}>
                <Camera size={16} color={colors.primaryStrong} />
              </View>
              <ButtonText>{t('certifications.form.takePhoto')}</ButtonText>
            </Button>
            <Button variant="outline" className="flex-1" onPress={() => void pick('library')} testID="certification-library">
              <View style={styles.buttonIcon}>
                <ImagePlus size={16} color={colors.primaryStrong} />
              </View>
              <ButtonText>{t('certifications.form.choosePhoto')}</ButtonText>
            </Button>
          </HStack>
          {photoError ? (
            <Text size="sm" className="mt-2 text-error-600" accessibilityRole="alert" testID="certification-photo-error">
              {photoError}
            </Text>
          ) : null}
        </SectionCard>

        {failure ? (
          <View className="mb-3">
            <FormAlert tone="error" title={failure.title} message={failure.message} testID="certification-form-message" />
          </View>
        ) : submitted && hasErrors ? (
          <View className="mb-3">
            <FormAlert tone="error" message={t('certifications.validation.fixFields')} testID="certification-form-message" />
          </View>
        ) : null}

        <VStack space="sm">
          <Button size="lg" onPress={() => void save()} isDisabled={isSaving} testID="certification-save">
            {isSaving ? <ButtonSpinner color={colors.textInverse} /> : <ButtonText>{existing ? t('certifications.form.saveChanges') : t('certifications.form.save')}</ButtonText>}
          </Button>
          <Button size="lg" variant="link" action="secondary" onPress={onBack} isDisabled={isSaving} testID="certification-cancel">
            <ButtonText>{t('certifications.cancel')}</ButtonText>
          </Button>
        </VStack>
      </ScrollView>

      <OptionSheet
        isOpen={isTypeSheetOpen}
        onClose={() => setIsTypeSheetOpen(false)}
        title={t('certifications.form.type')}
        options={typeOptions}
        selected={typeId}
        onSelect={chooseType}
        testID="certification-type-sheet"
      />
    </View>
  );
};

const styles = StyleSheet.create({
  content: { padding: 16, paddingBottom: 40 },
  buttonIcon: { marginRight: 6 },
});
