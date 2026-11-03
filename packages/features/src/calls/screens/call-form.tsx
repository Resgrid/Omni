import { isApiError } from '@resgrid/api';
import { useFeatureFlag, useSecurity } from '@resgrid/auth';
import { useCapability } from '@resgrid/config';
import { useCallDetailStore, useCallsStore } from '@resgrid/data';
import { useTranslation } from '@resgrid/i18n';
import { type CallQuickTemplateResultData, type NewCallFieldKey, NewCallFieldKeys, type UdfFieldValueInput } from '@resgrid/models';
import { Button, ButtonText, DateTimeField, Input, InputField, Loading, Pressable, ScreenHeader, Spinner, Switch, Text, Textarea, TextareaInput, useFormFactor, useThemeColors, useToast, ZeroState } from '@resgrid/ui';
import { useRouter } from 'expo-router';
import { MapPin, Search } from 'lucide-react-native';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { CallContactPicker } from '../components/call-form/contact-picker';
import { CallTemplatesModal, LinkedCallModal, ProtocolSelectorModal } from '../components/call-form/form-pickers';
import { UdfFields } from '../components/call-form/udf-fields';
import { DispatchSelectionModal, summarizeDispatchSelection } from '../components/dispatch-selection';
import { OfflineCallBanner } from '../components/offline-call-banner';
import { OptionChips } from '../components/option-chips';
import { QueuedCallBadge } from '../components/queued-call-badge';
import { type ContactPickerProps, useCallFormHookPoints } from '../hook-points';
import { useCallTemplates, useDispatchRecipients, useNewCallFieldPolicy } from '../hooks/use-call-form-data';
import { CALL_SHORTCUTS_AVAILABLE, useCallShortcuts } from '../hooks/use-call-shortcuts';
import { useCallUdfFields } from '../hooks/use-call-udf-fields';
import { useIsOnline } from '../hooks/use-connectivity';
import {
  type CallFormEditContext,
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
import { type GeocodeLookup, isWhat3WordsFormat, lookupAddress, lookupAddressAt, lookupPlusCode, lookupWhat3Words } from '../lib/call-geocoding';
import { defaultPriorityId, priorityOptions } from '../lib/call-priority';
import { MIN_DISPATCH_LEAD_MINUTES } from '../lib/call-schedule';
import { CallState } from '../lib/call-time';
import { describeCallFields } from '../lib/field-policy';
import { getMissingCallFieldsFromRefusal } from '../lib/server-refusal';
import { PENDING_CALLS_ROUTE } from '../routes';

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
  /** Replaces the map preview of the location section (default: the app's `StaticLocationMap` hook point). */
  mapSlot?: (location: CallFormLocation | null, onPick: (location: CallFormLocation) => void) => React.ReactNode;
  /** After a successful save (default: navigate back; a call saved as Pending opens the pending queue). */
  onDone?: () => void;
}

/** Fields a quick create shows even when the policy does not require them. */
const QUICK_FIELDS = new Set<NewCallFieldKey>([NewCallFieldKeys.Address, NewCallFieldKeys.Geolocation, NewCallFieldKeys.Note]);

type LookupKind = 'address' | 'what3words' | 'plusCode' | 'reverse';

/** Starting values from `initial`, with what the form already holds for a field kept. */
const mergeUdfValues = (initial: readonly UdfFieldValueInput[], current: readonly UdfFieldValueInput[]): UdfFieldValueInput[] => [
  ...initial.filter((value) => !current.some((entry) => entry.UdfFieldId === value.UdfFieldId)),
  ...current,
];

/**
 * Create / edit a call for every variant (omni-plan §7.10, Dispatch baseline + Unit location fields): templates, contact
 * picker, linked call, protocols, custom fields, run-card recommendation (`calls.runCards`), server geocoding of an
 * address, what3words or plus code, coordinate entry, a map picker, POI destination, scheduling and pending
 * (`calls.queues`), honouring the department's new-call field policy — which also holds the save back until it has
 * loaded. `calls.create` `quick` shows the core fields plus whatever the policy requires; `full` shows everything the
 * policy allows. An edit adds protocols and a linked call (EditCall keeps the ones the call has), resends only a newly
 * picked dispatch time, can tell resources taken off the call, and leaves the fields the policy hides as stored.
 *
 * Offline (plan §8.5): creating goes through the outbox — the call is saved on the device as "Queued — not dispatched
 * yet" (no number, nobody paged) and sent on reconnect; a refused call stays in Pending sync and opens here for
 * correction under the same client GUID. Editing and the location lookups need a connection.
 */
export default function CallFormScreen({ mode, callId, correctLocalId, mapSlot, onDone }: CallFormScreenProps) {
  const { t } = useTranslation();
  const router = useRouter();
  const toast = useToast();
  const colors = useThemeColors();
  const calls = useCapability('calls');
  const { canUserCreateCalls } = useSecurity();
  const runCardsFlag = useFeatureFlag('Dispatch.RunCards');
  const { isDesktop } = useFormFactor();
  const isOnline = useIsOnline();
  const policy = useNewCallFieldPolicy();
  const hookPoints = useCallFormHookPoints();
  const isEdit = mode === 'edit';
  const isFull = isEdit || calls.create === 'full';
  const { templates } = useCallTemplates(!isEdit && isFull);
  const { recipients } = useDispatchRecipients(isFull || policy.isRequired(NewCallFieldKeys.DispatchList));
  const udf = useCallUdfFields(isFull, isEdit ? callId : undefined);

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
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [lookup, setLookup] = useState<LookupKind | null>(null);
  const [open, setOpen] = useState<null | 'dispatch' | 'templates' | 'linked' | 'protocols' | 'contact' | 'location'>(null);
  // Set once the form holds what it starts from (the call, the refused request, or a blank form).
  const [startedFrom, setStartedFrom] = useState<'blank' | 'source' | null>(() => (!isEdit && !correctLocalId ? 'blank' : null));
  const [initialDispatchOnUtc, setInitialDispatchOnUtc] = useState('');
  const [udfApplied, setUdfApplied] = useState(false);

  useEffect(() => {
    void fetchCallFormData();

    if (isEdit && callId) void fetchCallDetail(callId);
  }, [callId, fetchCallDetail, fetchCallFormData, isEdit]);

  // Start from the call (edit, hidden fields included) or the refused request (correction) once it is available.
  useEffect(() => {
    if (startedFrom === 'source') return;

    if (isEdit && detail?.call) {
      const start = callToFormValues(detail.call, detail.extraData?.Dispatches ?? [], { types: callTypes });

      setValues(start);
      setInitialDispatchOnUtc(start.dispatchOnUtc);
      setStartedFrom('source');
    } else if (!isEdit && queuedCall) {
      setValues(createRequestToFormValues(queuedCall.request));
      setStartedFrom('source');
    } else if (startedFrom === 'blank' && callPriorities.length > 0) {
      setValues((current) => (current.name || current.nature ? current : { ...current, priority: defaultPriorityId(callPriorities) }));
    }
  }, [callPriorities, callTypes, detail, isEdit, queuedCall, startedFrom]);

  // Custom fields start at their defaults (or, on an edit, what the call stores) once the form has its values.
  useEffect(() => {
    if (udfApplied || !startedFrom || !udf.initialValues) return;
    const initial = udf.initialValues;

    setValues((current) => ({ ...current, udfValues: mergeUdfValues(initial, current.udfValues) }));
    setUdfApplied(true);
  }, [startedFrom, udf.initialValues, udfApplied]);

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
  const showContactFields = show(NewCallFieldKeys.ContactName) || show(NewCallFieldKeys.ContactInfo);

  const pickers: CallFormPickers = {
    protocols: show(NewCallFieldKeys.Protocols),
    linkedCall: show(NewCallFieldKeys.LinkedCall),
    udf: isFull && udf.fields !== null && udfApplied,
    contact: showContactFields,
  };

  const location = useMemo<CallFormLocation | null>(() => {
    const parsed = parseCoordinates(values.coordinates);

    return parsed.ok ? { latitude: parsed.latitude, longitude: parsed.longitude } : null;
  }, [values.coordinates]);

  /** Fills a blank address for a point (Dispatch: a typed or picked point never overwrites the address the caller gave). */
  const fillBlankAddress = useCallback(
    async (point: CallFormLocation) => {
      if (!isOnline) return;
      setLookup('reverse');

      try {
        const address = await lookupAddressAt(point.latitude, point.longitude);

        if (address) setValues((current) => (current.address.trim() ? current : { ...current, address }));
      } catch {
        // The point is kept either way; the address stays as typed.
      } finally {
        setLookup(null);
      }
    },
    [isOnline]
  );

  /** A spot picked on the map: its address only fills a blank one. */
  const pickLocation = useCallback(
    (picked: CallFormLocation & { address?: string }) => {
      setValues((current) => ({ ...current, coordinates: formatCoordinates(picked.latitude, picked.longitude), address: current.address || picked.address || '' }));

      if (!picked.address) void fillBlankAddress(picked);
    },
    [fillBlankAddress]
  );

  /** An address, what3words or plus code lookup: the place it found replaces the address, as the dispatcher asked. */
  const runLookup = async (kind: Exclude<LookupKind, 'reverse'>) => {
    const text = (kind === 'address' ? values.address : kind === 'what3words' ? values.what3words : values.plusCode).trim();

    const messages = {
      address: { required: 'calls.address_required', found: 'calls.address_found', notFound: 'calls.address_not_found', failed: 'calls.geocoding_error' },
      what3words: { required: 'calls.what3words_required', found: 'calls.what3words_found', notFound: 'calls.what3words_not_found', failed: 'calls.what3words_geocoding_error' },
      plusCode: { required: 'calls.plus_code_required', found: 'calls.plus_code_found', notFound: 'calls.plus_code_not_found', failed: 'calls.plus_code_geocoding_error' },
    }[kind];

    if (!text) {
      toast.warning(t(messages.required));

      return;
    }

    if (kind === 'what3words' && !isWhat3WordsFormat(text)) {
      toast.warning(t('calls.what3words_invalid_format'));

      return;
    }

    setLookup(kind);

    try {
      const result: GeocodeLookup = await (kind === 'address' ? lookupAddress(text) : kind === 'what3words' ? lookupWhat3Words(text) : lookupPlusCode(text));
      const place = result.place;

      if (place) {
        setValues((current) => ({ ...current, coordinates: formatCoordinates(place.latitude, place.longitude), address: place.address || current.address }));
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

  /** Typed coordinates: once they parse, a blank address is looked up for them. */
  const commitCoordinates = () => {
    if (location && !values.address.trim()) void fillBlankAddress(location);
  };

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

  const done = (outcome: 'saved' | 'pending' = 'saved') => {
    if (onDone) onDone();
    // Saved for later: show the queue it now waits in (Dispatch).
    else if (outcome === 'pending' && calls.queues) router.replace(PENDING_CALLS_ROUTE);
    else router.back();
  };

  const editContext = useMemo<CallFormEditContext | null>(
    () => (isEdit && detail?.call ? { call: detail.call, storedProtocolCount: detail.extraData ? (detail.extraData.Protocols?.length ?? 0) : null, initialDispatchOnUtc } : null),
    [detail, initialDispatchOnUtc, isEdit]
  );

  const udfLabel = (fieldId: string): string => {
    const field = udf.fields?.find((entry) => entry.UdfFieldId === fieldId);

    return field ? field.Label || field.Name : fieldId;
  };

  const submit = async () => {
    if (isSubmitting) return;

    if (isEdit && !isOnline) {
      toast.error(t('calls.edit.offline'));

      return;
    }

    // The policy reads as "nothing required" until it lands; hold the save back rather than skip every requirement.
    if (!policy.isLoaded) {
      toast.error(t('calls.field_policy_loading'));

      return;
    }

    const validation = validateCallForm(values, {
      policy,
      udfFields: pickers.udf ? udf.fields : null,
      validPriorityIds: priorities.map((priority) => priority.id),
      validTypeNames: callTypes.map((type) => type.Name),
      edit: editContext,
    });

    setErrors(validation.errors);
    setMissingUdf(validation.missingUdfFields);

    if (!validation.isValid) {
      const missing = [...validation.missingPolicyFields, ...validation.missingUdfFields.map(udfLabel)];

      if (missing.length > 0) toast.error(t(isEdit ? 'calls.required_fields_missing_edit' : 'calls.required_fields_missing', { fields: describeCallFields(missing, t) }));
      else if (validation.dispatchTooSoon) toast.error(t('calls.dispatch_on_too_soon', { minutes: MIN_DISPATCH_LEAD_MINUTES }));
      else toast.error(t('calls.validation.fix_errors'));

      return;
    }

    setIsSubmitting(true);

    try {
      if (isEdit && callId && editContext) {
        await updateCall(toUpdateCallRequest(callId, values, pickers, { edit: editContext, isVisible: policy.isVisible }));
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
        toast.success(t(values.isPending ? 'calls.pending_saved' : 'calls.create_success'));
        done(values.isPending ? 'pending' : 'saved');
      } else if (result.outcome === 'queued') {
        toast.info(t('calls.queued.created_offline'));
        done();
      } else {
        // Refused: it stays in Pending sync; keep the form open on it for correction.
        setStartedFrom('source');
        setCorrectingId(result.id);
        toast.error(t('calls.queued.rejected_on_create'));
      }
    } catch (error) {
      // The server refuses an edit that would leave a required field blank and names the fields (it also sees what this
      // form cannot, such as the links already on the call).
      const missingOnServer = isApiError(error) ? getMissingCallFieldsFromRefusal(error) : null;

      if (missingOnServer) toast.error(t(isEdit ? 'calls.required_fields_missing_edit' : 'calls.required_fields_missing', { fields: describeCallFields(missingOnServer, t) }));
      else toast.error(isEdit ? t('call_detail.update_call_error') : t('calls.create_error'));
    } finally {
      setIsSubmitting(false);
    }
  };

  useCallShortcuts({
    onBack: () => {
      if (open === null) router.back();
    },
    onSubmit: () => {
      if (open === null) void submit();
    },
  });

  if (!isEdit && (calls.create === 'none' || !canUserCreateCalls)) {
    return <ZeroState isError heading={t('calls.create_not_allowed')} description={t('calls.create_not_allowed_description')} testID="call-form-not-allowed" />;
  }

  if (isEdit && !detail?.call) {
    return <Loading text={t('call_detail.loading')} />;
  }

  const title = isEdit ? t('calls.edit_call') : correctingId ? t('calls.queued.correct_title') : t('calls.new_call');
  const runCardsAvailable = calls.runCards && runCardsFlag && !!hookPoints.RunCardRecommendation;
  const ContactPicker: React.ComponentType<ContactPickerProps> = hookPoints.ContactPicker ?? CallContactPicker;
  const RunCardRecommendation = hookPoints.RunCardRecommendation;
  const { LocationPicker, StaticLocationMap } = hookPoints;
  const isPendingCall = isEdit ? detail?.call?.State === CallState.Pending : values.isPending;
  const attachedProtocols = isEdit ? (detail?.extraData?.Protocols ?? []) : [];
  const submitLabel = isEdit ? t('common.save') : correctingId ? t('calls.queued.resubmit') : values.isPending ? t('calls.save_pending_call') : t('calls.create');

  const lookupButton = (kind: Exclude<LookupKind, 'reverse'>, label: string, value: string, testID: string) => (
    <Button
      variant="outline"
      size="sm"
      className="ml-2"
      onPress={() => void runLookup(kind)}
      isDisabled={!isOnline || lookup !== null || !value.trim()}
      accessibilityLabel={label}
      accessibilityState={{ busy: lookup === kind }}
      testID={testID}
    >
      {lookup === kind ? (
        <Spinner size="small" />
      ) : (
        <View>
          <Search size={16} color={colors.icon} />
        </View>
      )}
    </Button>
  );

  const textField = (
    key: keyof CallFormValues,
    label: string,
    options: {
      placeholder?: string;
      errorKey?: CallFormErrorKey;
      multiline?: boolean;
      testID: string;
      keyboardType?: 'default' | 'numbers-and-punctuation';
      /** Enter (and, unless `commitOnBlur` is false, leaving the field). */
      onCommit?: () => void;
      commitOnBlur?: boolean;
      action?: React.ReactNode;
    }
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
          <View style={styles.inputRow}>
            <Input variant="outline" isInvalid={!!error} className="flex-1">
              <InputField
                value={value}
                onChangeText={(text: string) => set(key, text as CallFormValues[typeof key])}
                onBlur={options.commitOnBlur === false ? undefined : options.onCommit}
                onSubmitEditing={options.onCommit}
                placeholder={options.placeholder}
                keyboardType={options.keyboardType ?? 'default'}
                accessibilityLabel={label}
                testID={options.testID}
              />
            </Input>
            {options.action}
          </View>
        )}
        {error ? (
          <Text size="xs" className="mt-1 text-error-600" testID={`${options.testID}-error`}>
            {t(error, { minutes: MIN_DISPATCH_LEAD_MINUTES })}
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
      {!isOnline ? isEdit ? <Text className="mx-3 my-2 text-warning-700">{t('calls.edit.offline')}</Text> : <OfflineCallBanner context="form" /> : null}
      <ScrollView contentContainerStyle={StyleSheet.flatten([styles.content, isDesktop ? styles.desktop : null])} keyboardShouldPersistTaps="handled">
        {queuedCall ? (
          <View style={styles.section} className="bg-background-0" testID="call-form-correction">
            <QueuedCallBadge marker={{ localId: queuedCall.localId, state: queuedCall.state }} />
            <Text size="sm" className="mt-2 text-typography-700">
              {queuedCall.state === 'rejected' ? t('calls.queued.rejected_explainer') : t('calls.queued.queued_explainer')}
            </Text>
          </View>
        ) : null}

        {!isEdit && isFull && templates.length > 0
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
                  {`${t('calls.type')} *`}
                </Text>
                <OptionChips
                  options={callTypes.map((type) => ({ value: type.Name, label: type.Name }))}
                  selected={values.type ? [values.type] : []}
                  onToggle={(name) => set('type', values.type === name ? '' : name)}
                  accessibilityLabel={t('calls.type')}
                  testID="call-form-type"
                />
                {errors.type ? (
                  <Text size="xs" className="text-error-600" testID="call-form-type-error">
                    {t(errors.type)}
                  </Text>
                ) : null}
              </View>
            ) : null}
          </>,
          'call-form-basics'
        )}

        {section(
          'calls.call_location',
          <>
            {show(NewCallFieldKeys.Address)
              ? textField('address', `${t('calls.address')}${req(NewCallFieldKeys.Address)}`, {
                  placeholder: t('calls.address_placeholder'),
                  errorKey: NewCallFieldKeys.Address,
                  testID: 'call-form-address',
                  // Enter searches the address (Dispatch web); leaving the field does not.
                  onCommit: () => (values.address.trim() && isOnline && lookup === null ? void runLookup('address') : undefined),
                  commitOnBlur: false,
                  action: lookupButton('address', t('calls.search_address'), values.address, 'call-form-address-search'),
                })
              : null}
            {show(NewCallFieldKeys.Geolocation)
              ? textField('coordinates', `${t('calls.coordinates')}${req(NewCallFieldKeys.Geolocation)}`, {
                  placeholder: t('calls.coordinates_placeholder'),
                  errorKey: errors.coordinates ? 'coordinates' : NewCallFieldKeys.Geolocation,
                  keyboardType: 'numbers-and-punctuation',
                  testID: 'call-form-coordinates',
                  onCommit: commitCoordinates,
                })
              : null}
            {lookup === 'reverse' ? (
              <Text size="xs" className="mb-2 text-typography-500" testID="call-form-looking-up-address">
                {t('calls.looking_up_address')}
              </Text>
            ) : null}
            {show(NewCallFieldKeys.What3Words)
              ? textField('what3words', `${t('calls.what3words')}${req(NewCallFieldKeys.What3Words)}`, {
                  placeholder: t('calls.what3words_placeholder'),
                  errorKey: NewCallFieldKeys.What3Words,
                  testID: 'call-form-w3w',
                  action: lookupButton('what3words', t('calls.search_what3words'), values.what3words, 'call-form-w3w-search'),
                })
              : null}
            {show(NewCallFieldKeys.PlusCode)
              ? textField('plusCode', t('calls.plus_code'), {
                  placeholder: t('calls.plus_code_placeholder'),
                  testID: 'call-form-plus-code',
                  action: lookupButton('plusCode', t('calls.search_plus_code'), values.plusCode, 'call-form-plus-code-search'),
                })
              : null}
            {show(NewCallFieldKeys.Geolocation) ? (
              <>
                {mapSlot ? (
                  <View style={styles.map} testID="call-form-map-slot">
                    {mapSlot(location, pickLocation)}
                  </View>
                ) : location && StaticLocationMap ? (
                  <View style={styles.map} testID="call-form-map-preview">
                    <StaticLocationMap latitude={location.latitude} longitude={location.longitude} address={values.address || undefined} height={200} onPress={LocationPicker ? () => setOpen('location') : undefined} />
                  </View>
                ) : null}
                {LocationPicker ? (
                  <Button variant="outline" size="sm" className="mb-2 self-start" onPress={() => setOpen('location')} accessibilityLabel={t('calls.select_location')} testID="call-form-pick-location">
                    <View style={styles.buttonIcon}>
                      <MapPin size={16} color={colors.primary} />
                    </View>
                    <ButtonText>{t('calls.select_location')}</ButtonText>
                  </Button>
                ) : null}
              </>
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

        {showContactFields || show(NewCallFieldKeys.ExternalId) || show(NewCallFieldKeys.IncidentId) || show(NewCallFieldKeys.ReferenceId)
          ? section(
              'call_detail.tabs.contact',
              <>
                {showContactFields ? (
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
              'call-form-contact'
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
                    accessibilityLabel={isEdit ? t('calls.protocols.add') : t('calls.protocols.select')}
                    className="mb-2 rounded-lg border border-outline-200 p-3"
                    testID="call-form-protocols"
                  >
                    <Text className="text-typography-900">{`${t('call_detail.tabs.protocols')}${req(NewCallFieldKeys.Protocols)}`}</Text>
                    {attachedProtocols.length > 0 ? (
                      <Text size="xs" className="text-typography-500" testID="call-form-protocols-attached">
                        {t('calls.protocols.attached', { names: attachedProtocols.map((protocol) => protocol.Name).join(', ') })}
                      </Text>
                    ) : null}
                    <Text size="xs" className="text-typography-500">
                      {values.protocolIds.length > 0 ? t('calls.protocols.selected_count', { count: values.protocolIds.length }) : isEdit ? t('calls.protocols.add') : t('common.none')}
                    </Text>
                  </Pressable>
                ) : null}
                {pickers.linkedCall ? (
                  <Pressable onPress={() => setOpen('linked')} accessibilityRole="button" accessibilityLabel={t('calls.linked_call')} className="rounded-lg border border-outline-200 p-3" testID="call-form-linked">
                    <Text className="text-typography-900">{`${t('calls.linked_call')}${req(NewCallFieldKeys.LinkedCall)}`}</Text>
                    {isEdit ? (
                      <Text size="xs" className="text-typography-500">
                        {t('calls.linked_calls.edit_hint')}
                      </Text>
                    ) : null}
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
                {!isEdit && runCardsAvailable && RunCardRecommendation ? (
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
                  <Text className="text-typography-900">{`${t('calls.select_recipients')}${isPendingCall ? '' : req(NewCallFieldKeys.DispatchList)}`}</Text>
                  <Text size="xs" className="text-typography-500" testID="call-form-dispatch-summary">
                    {summarizeDispatchSelection(values.dispatch, recipients, { everyone: t('calls.everyone'), none: values.isPending ? t('common.none') : t('calls.dispatch.none_pages_everyone') })}
                  </Text>
                </Pressable>
                {errors.dispatchList ? (
                  <Text size="xs" className="mt-1 text-error-600">
                    {t('calls.validation.required')}
                  </Text>
                ) : null}
                {isEdit ? (
                  <View style={StyleSheet.flatten([styles.switchRow, styles.switchTop])}>
                    <View style={styles.switchText}>
                      <Text className="text-typography-900">{t('calls.notify_cancelled_entities')}</Text>
                      <Text size="xs" className="text-typography-500">
                        {t('calls.notify_cancelled_entities_description')}
                      </Text>
                    </View>
                    <Switch
                      value={values.notifyCancelledEntities}
                      onValueChange={(notify: boolean) => set('notifyCancelledEntities', notify)}
                      accessibilityLabel={t('calls.notify_cancelled_entities')}
                      testID="call-form-notify-cancelled"
                    />
                  </View>
                ) : null}
              </>,
              'call-form-dispatch-section'
            )
          : null}

        {calls.queues && isFull && (!isEdit || policy.isVisible(NewCallFieldKeys.DispatchOn))
          ? section(
              'calls.scheduling.title',
              <>
                {!isEdit ? (
                  <View style={styles.switchRow}>
                    <View style={styles.switchText}>
                      <Text className="text-typography-900">{t('calls.scheduling.pending')}</Text>
                      <Text size="xs" className="text-typography-500">
                        {t('calls.scheduling.pending_hint')}
                      </Text>
                    </View>
                    <Switch value={values.isPending} onValueChange={(pending: boolean) => set('isPending', pending)} accessibilityLabel={t('calls.scheduling.pending')} testID="call-form-pending" />
                  </View>
                ) : null}
                {!values.isPending && (isEdit || show(NewCallFieldKeys.DispatchOn)) ? (
                  <View style={styles.field}>
                    <DateTimeField
                      mode="datetime"
                      label={`${t('calls.dispatch_on')}${isEdit ? '' : req(NewCallFieldKeys.DispatchOn)}`}
                      value={values.dispatchOnUtc}
                      onChange={(value) => set('dispatchOnUtc', value)}
                      // A scheduled call's time can be moved but not cleared (EditCall cannot remove a schedule).
                      clearable={!isEdit || !initialDispatchOnUtc}
                      testID="call-form-dispatch-on"
                    />
                    <Text size="xs" className="mt-1 text-typography-500">
                      {isEdit ? t('calls.scheduled_on_edit_hint') : t('calls.scheduled_on_helper', { minutes: MIN_DISPATCH_LEAD_MINUTES })}
                    </Text>
                    {errors.dispatchOnUtc ? (
                      <Text size="xs" className="mt-1 text-error-600" testID="call-form-dispatch-on-error">
                        {t(errors.dispatchOnUtc, { minutes: MIN_DISPATCH_LEAD_MINUTES })}
                      </Text>
                    ) : null}
                  </View>
                ) : null}
              </>,
              'call-form-scheduling'
            )
          : null}

        {pickers.udf && udf.fields
          ? section('calls.custom_fields', <UdfFields fields={udf.fields} values={values.udfValues} onChange={(udfValues) => set('udfValues', udfValues)} missingFieldIds={missingUdf} />, 'call-form-udf')
          : null}

        <View style={styles.actions}>
          <Button variant="outline" className="mr-2 flex-1" onPress={() => router.back()} isDisabled={isSubmitting} accessibilityLabel={t('common.cancel')}>
            <ButtonText>{t('common.cancel')}</ButtonText>
          </Button>
          <Button className="flex-1" onPress={() => void submit()} isDisabled={isSubmitting || !policy.isLoaded} accessibilityLabel={submitLabel} testID="call-form-submit">
            <ButtonText>{isSubmitting ? t('common.submitting') : submitLabel}</ButtonText>
          </Button>
        </View>
        {CALL_SHORTCUTS_AVAILABLE && isDesktop ? (
          <Text size="xs" className="mt-2 text-center text-typography-500" testID="call-form-shortcuts-hint">
            {isEdit ? t('calls.edit_keyboard_shortcuts') : t('calls.keyboard_shortcuts')}
          </Text>
        ) : null}
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
      {showContactFields ? (
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
              coordinates: current.coordinates || (contact.latitude !== undefined && contact.longitude !== undefined ? formatCoordinates(contact.latitude, contact.longitude) : ''),
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
  inputRow: { flexDirection: 'row', alignItems: 'center' },
  map: { height: 200, borderRadius: 8, overflow: 'hidden', marginBottom: 10 },
  buttonIcon: { marginRight: 4 },
  switchRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  switchTop: { marginTop: 12 },
  switchText: { flex: 1, marginRight: 8 },
  actions: { flexDirection: 'row', marginTop: 8 },
});
