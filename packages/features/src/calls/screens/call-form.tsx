import { useFeatureFlag, useSecurity } from '@resgrid/auth';
import { useCapability } from '@resgrid/config';
import { useCallDetailStore, useCallsStore } from '@resgrid/data';
import { useTranslation } from '@resgrid/i18n';
import { type CallQuickTemplateResultData, type NewCallFieldKey, NewCallFieldKeys, type UdfFieldResultData } from '@resgrid/models';
import { Button, ButtonText, DateTimeField, Input, InputField, Loading, Pressable, ScreenHeader, Switch, Text, Textarea, TextareaInput, useFormFactor, useToast, ZeroState } from '@resgrid/ui';
import { useRouter } from 'expo-router';
import { MapPin } from 'lucide-react-native';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { CallTemplatesModal, LinkedCallModal, ProtocolSelectorModal } from '../components/call-form/form-pickers';
import { UdfFields } from '../components/call-form/udf-fields';
import { DispatchSelectionModal, summarizeDispatchSelection } from '../components/dispatch-selection';
import { OfflineCallBanner } from '../components/offline-call-banner';
import { OptionChips } from '../components/option-chips';
import { QueuedCallBadge } from '../components/queued-call-badge';
import { useCallFormHookPoints } from '../hook-points';
import { useCallTemplates, useDispatchRecipients, useNewCallFieldPolicy } from '../hooks/use-call-form-data';
import { useIsOnline } from '../hooks/use-connectivity';
import {
  type CallFormErrorKey,
  type CallFormPickers,
  type CallFormValues,
  callToFormValues,
  createRequestToFormValues,
  emptyCallFormValues,
  formatCoordinates,
  parseCoordinates,
  toCreateCallRequest,
  toUpdateCallRequest,
  validateCallForm,
} from '../lib/call-form';
import { defaultPriorityId, priorityOptions } from '../lib/call-priority';
import { FIELD_LABEL_KEYS } from '../lib/field-policy';

export interface CallFormLocation {
  latitude: number;
  longitude: number;
}

export interface CallFormScreenProps {
  mode: 'create' | 'edit';
  /** Edit: the server call id. */
  callId?: string;
  /** Create: correct this rejected queued call (client GUID) instead of creating a new one. */
  correctLocalId?: string;
  /** Map placeholder for the location section (the maps workstream fills it; never imported here). */
  mapSlot?: (location: CallFormLocation | null, onPick: (location: CallFormLocation) => void) => React.ReactNode;
  /** After a successful save (default: navigate back). */
  onDone?: () => void;
}

/** Fields a quick create shows even when the policy does not require them. */
const QUICK_FIELDS = new Set<NewCallFieldKey>([NewCallFieldKeys.Address, NewCallFieldKeys.Geolocation, NewCallFieldKeys.Note]);

/**
 * Create / edit a call (omni-plan §7.10: Dispatch superset + Unit location fields): templates, contact picker hook,
 * linked call, protocols, custom fields, run-card recommendation hook (`calls.runCards`), coordinate entry, POI
 * destination, scheduling and pending (`calls.queues`), honouring the department's new-call field policy. `calls.create`
 * `quick` shows the core fields plus whatever the policy requires; `full` shows everything the policy allows.
 *
 * Offline (plan §8.5): creating goes through the outbox — the call is saved on the device as "Queued — not dispatched
 * yet" (no number, nobody paged) and sent on reconnect; a refused call stays in Pending sync and opens here for
 * correction under the same client GUID. Editing needs a connection.
 */
export default function CallFormScreen({ mode, callId, correctLocalId, mapSlot, onDone }: CallFormScreenProps) {
  const { t } = useTranslation();
  const router = useRouter();
  const toast = useToast();
  const calls = useCapability('calls');
  const { canUserCreateCalls } = useSecurity();
  const runCardsFlag = useFeatureFlag('Dispatch.RunCards');
  const { isDesktop } = useFormFactor();
  const isOnline = useIsOnline();
  const policy = useNewCallFieldPolicy();
  const hookPoints = useCallFormHookPoints();
  const isFull = mode === 'edit' || calls.create === 'full';
  const { templates } = useCallTemplates(mode === 'create' && isFull);
  const { recipients } = useDispatchRecipients(isFull || policy.isRequired(NewCallFieldKeys.DispatchList));

  const callPriorities = useCallsStore((state) => state.callPriorities);
  const callTypes = useCallsStore((state) => state.callTypes);
  const destinationPois = useCallsStore((state) => state.destinationPois);
  const fetchCallFormData = useCallsStore((state) => state.fetchCallFormData);
  const createCall = useCallsStore((state) => state.createCall);
  const correctQueuedCall = useCallsStore((state) => state.correctQueuedCall);
  const [correctingId, setCorrectingId] = useState<string | undefined>(correctLocalId);
  const queuedCall = useCallsStore((state) => (correctingId ? state.queuedCalls[correctingId] : undefined));
  const detail = useCallDetailStore((state) => (callId ? state.details[callId] : undefined));
  const fetchCallDetail = useCallDetailStore((state) => state.fetchCallDetail);
  const updateCall = useCallDetailStore((state) => state.updateCall);

  const priorities = useMemo(() => priorityOptions(callPriorities), [callPriorities]);
  const [values, setValues] = useState<CallFormValues>(() => emptyCallFormValues(defaultPriorityId(callPriorities)));
  const [errors, setErrors] = useState<Partial<Record<CallFormErrorKey, string>>>({});
  const [missingUdf, setMissingUdf] = useState<string[]>([]);
  const [udfFields, setUdfFields] = useState<UdfFieldResultData[] | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [open, setOpen] = useState<null | 'dispatch' | 'templates' | 'linked' | 'protocols' | 'contact' | 'location'>(null);
  const initialized = useRef(false);

  useEffect(() => {
    void fetchCallFormData();
    if (mode === 'edit' && callId) void fetchCallDetail(callId);
  }, [callId, fetchCallDetail, fetchCallFormData, mode]);

  useEffect(() => {
    if (!hookPoints.loadUdfFields || !isFull) return undefined;
    let cancelled = false;
    hookPoints
      .loadUdfFields()
      .then((fields) => {
        if (!cancelled) setUdfFields(fields);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [hookPoints, isFull]);

  // Start from the call (edit, hidden fields included) or the refused request (correction) once it is available.
  useEffect(() => {
    if (initialized.current) return;
    if (mode === 'edit' && detail?.call) {
      setValues(callToFormValues(detail.call, detail.extraData?.Dispatches ?? []));
      initialized.current = true;
    } else if (mode === 'create' && queuedCall) {
      setValues(createRequestToFormValues(queuedCall.request));
      initialized.current = true;
    } else if (mode === 'create' && !correctingId && callPriorities.length > 0) {
      setValues((current) => (current.name || current.nature ? current : { ...current, priority: defaultPriorityId(callPriorities) }));
    }
  }, [callPriorities, correctingId, detail, mode, queuedCall]);

  const set = useCallback(<K extends keyof CallFormValues>(key: K, value: CallFormValues[K]) => {
    setValues((current) => ({ ...current, [key]: value }));
    setErrors((current) => {
      if (!(key in current)) return current;
      const next = { ...current };
      delete next[key as CallFormErrorKey];
      return next;
    });
  }, []);

  const show = (key: NewCallFieldKey): boolean => policy.isVisible(key) && (isFull || QUICK_FIELDS.has(key) || policy.isRequired(key));
  const req = (key: NewCallFieldKey): string => (policy.isRequired(key) ? ' *' : '');

  const pickers: CallFormPickers = {
    protocols: show(NewCallFieldKeys.Protocols),
    linkedCall: show(NewCallFieldKeys.LinkedCall),
    udf: isFull && udfFields !== null,
    contact: !!hookPoints.ContactPicker,
  };

  const location = useMemo<CallFormLocation | null>(() => {
    const parsed = parseCoordinates(values.coordinates);
    return parsed.ok ? { latitude: parsed.latitude, longitude: parsed.longitude } : null;
  }, [values.coordinates]);

  const pickLocation = useCallback((picked: CallFormLocation & { address?: string }) => {
    setValues((current) => ({ ...current, coordinates: formatCoordinates(picked.latitude, picked.longitude), address: current.address || picked.address || '' }));
  }, []);

  const applyTemplate = (template: CallQuickTemplateResultData) => {
    setValues((current) => ({
      ...current,
      name: template.CallName || current.name,
      nature: template.CallNature || current.nature,
      type: template.CallType || current.type,
      priority: priorities.some((priority) => priority.id === template.CallPriority) ? template.CallPriority : current.priority,
    }));
    toast.success(t('calls.templates.applied'));
  };

  const done = () => {
    if (onDone) onDone();
    else router.back();
  };

  const submit = async () => {
    if (mode === 'edit' && !isOnline) {
      toast.error(t('calls.edit.offline'));
      return;
    }
    const validation = validateCallForm(values, { policy, udfFields: pickers.udf ? udfFields : null, validPriorityIds: priorities.map((priority) => priority.id) });
    setErrors(validation.errors);
    setMissingUdf(validation.missingUdfFields);
    if (!validation.isValid) {
      if (validation.missingPolicyFields.length > 0) toast.error(t('calls.required_fields_missing', { fields: validation.missingPolicyFields.map((key) => t(FIELD_LABEL_KEYS[key])).join(', ') }));
      else toast.error(t('calls.validation.fix_errors'));
      return;
    }
    setIsSubmitting(true);
    try {
      if (mode === 'edit' && callId) {
        await updateCall(toUpdateCallRequest(callId, values, pickers));
        toast.success(t('call_detail.update_call_success'));
        done();
        return;
      }
      const request = toCreateCallRequest(values, pickers);
      if (correctingId) {
        const ok = await correctQueuedCall(correctingId, request);
        if (ok) {
          toast.success(t('calls.queued.resubmitted'));
          done();
        } else {
          toast.error(t('calls.queued.correction_failed'));
        }
        return;
      }
      const result = await createCall(request);
      if (result.outcome === 'sent') {
        toast.success(t('calls.create_success'));
        done();
      } else if (result.outcome === 'queued') {
        toast.info(t('calls.queued.created_offline'));
        done();
      } else {
        // Refused: it stays in Pending sync; keep the form open on it for correction.
        initialized.current = true;
        setCorrectingId(result.id);
        toast.error(t('calls.queued.rejected_on_create'));
      }
    } catch {
      toast.error(mode === 'edit' ? t('call_detail.update_call_error') : t('calls.create_error'));
    } finally {
      setIsSubmitting(false);
    }
  };

  if (mode === 'create' && (calls.create === 'none' || !canUserCreateCalls)) {
    return <ZeroState isError heading={t('calls.create_not_allowed')} description={t('calls.create_not_allowed_description')} testID="call-form-not-allowed" />;
  }
  if (mode === 'edit' && !detail?.call) {
    return <Loading text={t('call_detail.loading')} />;
  }

  const title = mode === 'edit' ? t('calls.edit_call') : correctingId ? t('calls.queued.correct_title') : t('calls.new_call');
  const runCardsAvailable = calls.runCards && runCardsFlag && !!hookPoints.RunCardRecommendation;
  const ContactPicker = hookPoints.ContactPicker;
  const RunCardRecommendation = hookPoints.RunCardRecommendation;
  const LocationPicker = hookPoints.LocationPicker;

  const textField = (
    key: keyof CallFormValues,
    label: string,
    options: { placeholder?: string; errorKey?: CallFormErrorKey; multiline?: boolean; testID: string; keyboardType?: 'default' | 'numbers-and-punctuation' }
  ) => {
    const raw = values[key];
    const value = typeof raw === 'string' ? raw : '';
    const error = options.errorKey ? errors[options.errorKey] : undefined;
    return (
      <View style={styles.field}>
        <Text size="sm" className="mb-1 text-typography-700">
          {label}
        </Text>
        {options.multiline ? (
          <Textarea size="md" isInvalid={!!error}>
            <TextareaInput value={value} onChangeText={(text: string) => set(key, text as CallFormValues[typeof key])} placeholder={options.placeholder} accessibilityLabel={label} testID={options.testID} />
          </Textarea>
        ) : (
          <Input variant="outline" isInvalid={!!error}>
            <InputField
              value={value}
              onChangeText={(text: string) => set(key, text as CallFormValues[typeof key])}
              placeholder={options.placeholder}
              keyboardType={options.keyboardType ?? 'default'}
              accessibilityLabel={label}
              testID={options.testID}
            />
          </Input>
        )}
        {error ? (
          <Text size="xs" className="mt-1 text-error-600" testID={`${options.testID}-error`}>
            {t(error)}
          </Text>
        ) : null}
      </View>
    );
  };

  const section = (titleKey: string, children: React.ReactNode, testID: string) => (
    <View style={styles.section} className="bg-background-0" testID={testID}>
      <Text className="mb-2 font-semibold text-typography-900" accessibilityRole="header">
        {t(titleKey)}
      </Text>
      {children}
    </View>
  );

  return (
    <View style={styles.screen} className="bg-background-50" testID="call-form-screen">
      <ScreenHeader title={title} onBack={() => router.back()} />
      {!isOnline ? mode === 'edit' ? <Text className="mx-3 my-2 text-warning-700">{t('calls.edit.offline')}</Text> : <OfflineCallBanner context="form" /> : null}
      <ScrollView contentContainerStyle={StyleSheet.flatten([styles.content, isDesktop ? styles.desktop : null])} keyboardShouldPersistTaps="handled">
        {queuedCall ? (
          <View style={styles.section} className="bg-background-0" testID="call-form-correction">
            <QueuedCallBadge marker={{ localId: queuedCall.localId, state: queuedCall.state }} />
            <Text size="sm" className="mt-2 text-typography-700">
              {queuedCall.state === 'rejected' ? t('calls.queued.rejected_explainer') : t('calls.queued.queued_explainer')}
            </Text>
          </View>
        ) : null}

        {mode === 'create' && isFull && templates.length > 0
          ? section(
              'calls.templates.title',
              <Button variant="outline" size="sm" className="self-start" onPress={() => setOpen('templates')} accessibilityLabel={t('calls.templates.select')} testID="call-form-templates">
                <ButtonText>{t('calls.templates.select')}</ButtonText>
              </Button>,
              'call-form-templates-section'
            )
          : null}

        {section(
          'calls.call_details',
          <>
            {textField('name', `${t('calls.name')} *`, { placeholder: t('calls.name_placeholder'), errorKey: 'name', testID: 'call-form-name' })}
            {textField('nature', `${t('calls.nature')} *`, { placeholder: t('calls.nature_placeholder'), errorKey: 'nature', multiline: true, testID: 'call-form-nature' })}
            <View style={styles.field}>
              <Text size="sm" className="mb-1 text-typography-700">
                {`${t('calls.priority')} *`}
              </Text>
              <OptionChips
                options={priorities.map((priority) => ({ value: priority.id, label: priority.isLabelKey ? t(priority.label) : priority.label, color: priority.color }))}
                selected={values.priority === null ? [] : [values.priority]}
                onToggle={(id) => set('priority', id)}
                accessibilityLabel={t('calls.priority')}
                testID="call-form-priority"
              />
              {errors.priority ? (
                <Text size="xs" className="text-error-600">
                  {t(errors.priority)}
                </Text>
              ) : null}
            </View>
            {callTypes.length > 0 ? (
              <View style={styles.field}>
                <Text size="sm" className="mb-1 text-typography-700">
                  {t('calls.type')}
                </Text>
                <OptionChips
                  options={callTypes.map((type) => ({ value: type.Name, label: type.Name }))}
                  selected={values.type ? [values.type] : []}
                  onToggle={(name) => set('type', values.type === name ? '' : name)}
                  accessibilityLabel={t('calls.type')}
                  testID="call-form-type"
                />
              </View>
            ) : null}
          </>,
          'call-form-basics'
        )}

        {section(
          'calls.call_location',
          <>
            {show(NewCallFieldKeys.Address)
              ? textField('address', `${t('calls.address')}${req(NewCallFieldKeys.Address)}`, { placeholder: t('calls.address_placeholder'), errorKey: NewCallFieldKeys.Address, testID: 'call-form-address' })
              : null}
            {show(NewCallFieldKeys.Geolocation)
              ? textField('coordinates', `${t('calls.coordinates')}${req(NewCallFieldKeys.Geolocation)}`, {
                  placeholder: t('calls.coordinates_placeholder'),
                  errorKey: errors.coordinates ? 'coordinates' : NewCallFieldKeys.Geolocation,
                  keyboardType: 'numbers-and-punctuation',
                  testID: 'call-form-coordinates',
                })
              : null}
            {show(NewCallFieldKeys.What3Words)
              ? textField('what3words', `${t('calls.what3words')}${req(NewCallFieldKeys.What3Words)}`, { placeholder: t('calls.what3words_placeholder'), errorKey: NewCallFieldKeys.What3Words, testID: 'call-form-w3w' })
              : null}
            {LocationPicker ? (
              <Button variant="outline" size="sm" className="mb-2 self-start" onPress={() => setOpen('location')} accessibilityLabel={t('calls.select_location')} testID="call-form-pick-location">
                <View style={styles.buttonIcon}>
                  <MapPin size={16} color="#2563EB" />
                </View>
                <ButtonText>{t('calls.select_location')}</ButtonText>
              </Button>
            ) : null}
            {mapSlot ? (
              <View style={styles.map} testID="call-form-map-slot">
                {mapSlot(location, pickLocation)}
              </View>
            ) : null}
            {show(NewCallFieldKeys.DestinationPoi) && destinationPois.length > 0 ? (
              <View style={styles.field}>
                <Text size="sm" className="mb-1 text-typography-700">
                  {`${t('calls.destination_poi')}${req(NewCallFieldKeys.DestinationPoi)}`}
                </Text>
                <OptionChips
                  options={destinationPois.map((poi) => ({ value: poi.PoiId, label: poi.Name || poi.Address || String(poi.PoiId) }))}
                  selected={values.destinationPoiId === null ? [] : [values.destinationPoiId]}
                  onToggle={(id) => set('destinationPoiId', values.destinationPoiId === id ? null : id)}
                  accessibilityLabel={t('calls.destination_poi')}
                  testID="call-form-destination"
                />
              </View>
            ) : null}
            {!isOnline ? (
              <Text size="xs" className="text-typography-500">
                {t('calls.offline.no_geocoding')}
              </Text>
            ) : null}
          </>,
          'call-form-location'
        )}

        {show(NewCallFieldKeys.ContactName) || show(NewCallFieldKeys.ContactInfo) || ContactPicker
          ? section(
              'call_detail.tabs.contact',
              <>
                {ContactPicker ? (
                  <Button variant="outline" size="sm" className="mb-2 self-start" onPress={() => setOpen('contact')} accessibilityLabel={t('calls.contact_picker.select')} testID="call-form-contact-picker">
                    <ButtonText>{t('calls.contact_picker.select')}</ButtonText>
                  </Button>
                ) : null}
                {show(NewCallFieldKeys.ContactName)
                  ? textField('contactName', `${t('calls.contact_name')}${req(NewCallFieldKeys.ContactName)}`, {
                      placeholder: t('calls.contact_name_placeholder'),
                      errorKey: NewCallFieldKeys.ContactName,
                      testID: 'call-form-contact-name',
                    })
                  : null}
                {show(NewCallFieldKeys.ContactInfo)
                  ? textField('contactInfo', `${t('calls.contact_info')}${req(NewCallFieldKeys.ContactInfo)}`, {
                      placeholder: t('calls.contact_info_placeholder'),
                      errorKey: NewCallFieldKeys.ContactInfo,
                      testID: 'call-form-contact-info',
                    })
                  : null}
              </>,
              'call-form-contact'
            )
          : null}

        {show(NewCallFieldKeys.IncidentId) || show(NewCallFieldKeys.ExternalId) || show(NewCallFieldKeys.ReferenceId)
          ? section(
              'calls.references',
              <>
                {show(NewCallFieldKeys.IncidentId)
                  ? textField('incidentId', `${t('calls.incident_id')}${req(NewCallFieldKeys.IncidentId)}`, { errorKey: NewCallFieldKeys.IncidentId, testID: 'call-form-incident-id' })
                  : null}
                {show(NewCallFieldKeys.ExternalId)
                  ? textField('externalId', `${t('call_detail.external_id')}${req(NewCallFieldKeys.ExternalId)}`, { errorKey: NewCallFieldKeys.ExternalId, testID: 'call-form-external-id' })
                  : null}
                {show(NewCallFieldKeys.ReferenceId)
                  ? textField('referenceId', `${t('call_detail.reference_id')}${req(NewCallFieldKeys.ReferenceId)}`, { errorKey: NewCallFieldKeys.ReferenceId, testID: 'call-form-reference-id' })
                  : null}
              </>,
              'call-form-references'
            )
          : null}

        {show(NewCallFieldKeys.Note)
          ? section(
              'calls.note',
              textField('note', `${t('calls.note')}${req(NewCallFieldKeys.Note)}`, { placeholder: t('calls.note_placeholder'), errorKey: NewCallFieldKeys.Note, multiline: true, testID: 'call-form-note' }),
              'call-form-note-section'
            )
          : null}

        {pickers.protocols || pickers.linkedCall
          ? section(
              'calls.related',
              <>
                {pickers.protocols ? (
                  <Pressable
                    onPress={() => setOpen('protocols')}
                    accessibilityRole="button"
                    accessibilityLabel={t('calls.protocols.select')}
                    className="mb-2 rounded-lg border border-outline-200 p-3"
                    testID="call-form-protocols"
                  >
                    <Text className="text-typography-900">{`${t('call_detail.tabs.protocols')}${req(NewCallFieldKeys.Protocols)}`}</Text>
                    <Text size="xs" className="text-typography-500">
                      {values.protocolIds.length > 0 ? t('calls.protocols.selected_count', { count: values.protocolIds.length }) : t('common.none')}
                    </Text>
                  </Pressable>
                ) : null}
                {pickers.linkedCall ? (
                  <Pressable onPress={() => setOpen('linked')} accessibilityRole="button" accessibilityLabel={t('calls.linked_call')} className="rounded-lg border border-outline-200 p-3" testID="call-form-linked">
                    <Text className="text-typography-900">{`${t('calls.linked_call')}${req(NewCallFieldKeys.LinkedCall)}`}</Text>
                    <Text size="xs" className="text-typography-500">
                      {values.linkedCall ? `#${values.linkedCall.number} ${values.linkedCall.name}` : t('common.none')}
                    </Text>
                  </Pressable>
                ) : null}
                {errors.protocols || errors.linkedCall ? (
                  <Text size="xs" className="mt-1 text-error-600">
                    {t('calls.validation.required')}
                  </Text>
                ) : null}
              </>,
              'call-form-related'
            )
          : null}

        {show(NewCallFieldKeys.DispatchList)
          ? section(
              'calls.dispatch_to',
              <>
                {runCardsAvailable && RunCardRecommendation ? (
                  <View style={styles.field} testID="call-form-run-card">
                    <RunCardRecommendation
                      call={{ type: values.type, priority: values.priority, latitude: location?.latitude, longitude: location?.longitude, address: values.address }}
                      selection={values.dispatch}
                      onApply={(selection, decision) =>
                        setValues((current) => ({ ...current, dispatch: selection, runCardOutcomeNodeKey: decision.outcomeNodeKey ?? '', unitResponseCodes: decision.unitResponseCodes ?? '' }))
                      }
                    />
                  </View>
                ) : null}
                <Pressable
                  onPress={() => setOpen('dispatch')}
                  accessibilityRole="button"
                  accessibilityLabel={t('calls.select_dispatch_recipients')}
                  className="rounded-lg border border-outline-200 p-3"
                  testID="call-form-dispatch"
                >
                  <Text className="text-typography-900">{`${t('calls.select_recipients')}${req(NewCallFieldKeys.DispatchList)}`}</Text>
                  <Text size="xs" className="text-typography-500" testID="call-form-dispatch-summary">
                    {summarizeDispatchSelection(values.dispatch, recipients, { everyone: t('calls.everyone'), none: values.isPending ? t('common.none') : t('calls.dispatch.none_pages_everyone') })}
                  </Text>
                </Pressable>
                {errors.dispatchList ? (
                  <Text size="xs" className="mt-1 text-error-600">
                    {t('calls.validation.required')}
                  </Text>
                ) : null}
              </>,
              'call-form-dispatch-section'
            )
          : null}

        {calls.queues && mode === 'create' && isFull
          ? section(
              'calls.scheduling.title',
              <>
                <View style={styles.switchRow}>
                  <View style={styles.switchText}>
                    <Text className="text-typography-900">{t('calls.scheduling.pending')}</Text>
                    <Text size="xs" className="text-typography-500">
                      {t('calls.scheduling.pending_hint')}
                    </Text>
                  </View>
                  <Switch value={values.isPending} onValueChange={(pending: boolean) => set('isPending', pending)} accessibilityLabel={t('calls.scheduling.pending')} testID="call-form-pending" />
                </View>
                {!values.isPending && show(NewCallFieldKeys.DispatchOn) ? (
                  <View style={styles.field}>
                    <DateTimeField
                      mode="datetime"
                      label={`${t('calls.dispatch_on')}${req(NewCallFieldKeys.DispatchOn)}`}
                      value={values.dispatchOnUtc}
                      onChange={(value) => set('dispatchOnUtc', value)}
                      testID="call-form-dispatch-on"
                    />
                  </View>
                ) : null}
              </>,
              'call-form-scheduling'
            )
          : null}

        {pickers.udf && udfFields
          ? section('calls.custom_fields', <UdfFields fields={udfFields} values={values.udfValues} onChange={(udfValues) => set('udfValues', udfValues)} missingFieldIds={missingUdf} />, 'call-form-udf')
          : null}

        <View style={styles.actions}>
          <Button variant="outline" className="mr-2 flex-1" onPress={() => router.back()} isDisabled={isSubmitting} accessibilityLabel={t('common.cancel')}>
            <ButtonText>{t('common.cancel')}</ButtonText>
          </Button>
          <Button
            className="flex-1"
            onPress={() => void submit()}
            isDisabled={isSubmitting}
            accessibilityLabel={mode === 'edit' ? t('common.save') : correctingId ? t('calls.queued.resubmit') : t('calls.create')}
            testID="call-form-submit"
          >
            <ButtonText>{isSubmitting ? t('common.submitting') : mode === 'edit' ? t('common.save') : correctingId ? t('calls.queued.resubmit') : t('calls.create')}</ButtonText>
          </Button>
        </View>
      </ScrollView>

      <DispatchSelectionModal
        isOpen={open === 'dispatch'}
        onClose={() => setOpen(null)}
        recipients={recipients}
        value={values.dispatch}
        allowEveryone={!values.isPending}
        onConfirm={(selection) => {
          set('dispatch', selection);
          setOpen(null);
        }}
      />
      <CallTemplatesModal isOpen={open === 'templates'} onClose={() => setOpen(null)} templates={templates} onSelect={applyTemplate} />
      {pickers.linkedCall ? (
        <LinkedCallModal isOpen={open === 'linked'} onClose={() => setOpen(null)} selectedCallId={values.linkedCall?.callId} excludeCallId={callId} onSelect={(linked) => set('linkedCall', linked)} />
      ) : null}
      {pickers.protocols ? <ProtocolSelectorModal isOpen={open === 'protocols'} onClose={() => setOpen(null)} selected={values.protocolIds} onConfirm={(ids) => set('protocolIds', ids)} /> : null}
      {ContactPicker ? (
        <ContactPicker
          isOpen={open === 'contact'}
          onClose={() => setOpen(null)}
          onSelect={(contact) => {
            setValues((current) => ({
              ...current,
              contactId: contact.contactId,
              contactName: contact.name,
              contactInfo: contact.info ?? current.contactInfo,
              address: current.address || contact.address || '',
              coordinates: current.coordinates || (typeof contact.latitude === 'number' && typeof contact.longitude === 'number' ? formatCoordinates(contact.latitude, contact.longitude) : ''),
            }));
            setOpen(null);
          }}
        />
      ) : null}
      {LocationPicker ? (
        <LocationPicker
          isOpen={open === 'location'}
          onClose={() => setOpen(null)}
          initial={location}
          onSelect={(picked) => {
            pickLocation(picked);
            setOpen(null);
          }}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { padding: 12, paddingBottom: 32 },
  desktop: { maxWidth: 960, alignSelf: 'center', width: '100%' },
  section: { borderRadius: 12, padding: 12, marginBottom: 12 },
  field: { marginBottom: 10 },
  map: { height: 200, borderRadius: 8, overflow: 'hidden', marginBottom: 10 },
  buttonIcon: { marginRight: 4 },
  switchRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  switchText: { flex: 1, marginRight: 8 },
  actions: { flexDirection: 'row', marginTop: 8 },
});
