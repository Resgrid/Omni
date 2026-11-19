import { isApiError } from '@resgrid/api';
import { replaceRoutePath } from '@resgrid/core/navigation/route-paths';
import { type DataError, personnelFullName, recurringScheduleKey, useCallsStore, usePoisStore, useRecurringCallsStore } from '@resgrid/data';
import {
  type ChipOption,
  defaultPriorityId,
  DispatchSelectionModal,
  OptionChips,
  parseCoordinates,
  priorityOptions,
  RecipientPickerModal,
  type RecipientPickerSection,
  useCallFormHookPoints,
  useDispatchRecipients,
} from '@resgrid/features/calls';
import { useTranslation } from '@resgrid/i18n';
import { type PoiResultData, RecurringCallCreationMode, type RecurringCallErrorData, RecurringCallFrequency } from '@resgrid/models';
import { Button, ButtonSpinner, ButtonText, DateTimeField, KeyboardAwareScrollView, Loading, Pressable, ScreenHeader, Text, useThemeColors, useToast, ZeroState } from '@resgrid/ui';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { MapPin, Users, X } from 'lucide-react-native';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { ActionButton } from '../components/action-button';
import { FieldError, FormSection, FormSwitchRow, FormTextField } from '../components/form-parts';
import { PoiPickerModal } from '../components/poi-picker-modal';
import { useIsRecurringCallsEnabled } from '../hooks/use-recurring-calls';
import { readSaveErrors } from '../lib/save-errors';
import {
  addTime,
  describeSaveError,
  emptyRecurringCallForm,
  errorField,
  type MonthlyMode,
  type RecurringCallFormField,
  type RecurringCallFormValues,
  scheduleToFormValues,
  toRecurringCallInput,
  validateRecurringCallForm,
} from '../lib/schedule-form';
import { formatAlertLead, formatMinutes, WEEK_ORDINAL_KEYS, weekdayName, WEEKDAYS } from '../lib/schedule-format';
import { summarizeNames, targetNames } from '../lib/targets';
import { recurringCallsRoutes } from '../routes';

/** Core's choices when the options have not loaded (RecurringCallsController). */
const FALLBACK_LEAD_CHOICES: readonly number[] = [60, 120, 240, 480, 720, 1440, 2880, 4320, 10080];
const FALLBACK_ALERT_CHOICES: readonly number[] = [0, 5, 10, 15, 30, 60, 120, 240];

type AlertSection = 'users' | 'groups' | 'roles';

type OpenPicker = null | 'dispatch' | 'alerts' | 'facility' | 'destination' | 'location';

const parseScheduleId = (value: string | string[] | undefined): number | null => {
  const raw = Array.isArray(value) ? value[0] : value;

  return raw && /^[1-9]\d*$/.test(raw) ? Number(raw) : null;
};

/** The choices offered, with the current value kept even when the department's list no longer has it. */
const withCurrent = (choices: readonly number[], current: number): number[] => (choices.includes(current) ? [...choices] : [...choices, current].sort((a, b) => a - b));

/** The schedule to edit could not be read and nothing said why (no answer for it). */
const SCHEDULE_NOT_FOUND: DataError = { code: 'not_found', messageKey: 'errors.data.not_found' };

/**
 * The name to keep when the POI changes: one the form filled in from the previous POI (or none) follows the new POI, one
 * the dispatcher typed stays.
 */
const nameForPoi = (current: string, previous: PoiResultData | null, next: PoiResultData | null): string => {
  const followsPoi = !current.trim() || (previous !== null && current === (previous.Name ?? ''));

  return followsPoi ? (next?.Name ?? '') : current;
};

export interface RecurringCallFormScreenProps {
  /** `create` (`/recurring-calls/new`) ignores any id; `edit` (`/recurring-calls/[id]/edit`) needs a valid one. */
  mode: 'create' | 'edit';
}

/**
 * Creates (`/recurring-calls/new`) or edits (`/recurring-calls/[id]/edit`) a recurring call schedule (Dispatch): its name
 * and description; how it repeats (daily, weekly on chosen days, monthly by date or by the nth/last weekday) at one or more
 * department-local times between two dates; whether each call is created ahead and sent automatically or a dispatcher is
 * alerted to send it; whether the run card adds resources (off, with the reason, when the department has no run cards);
 * the call each occurrence creates; the schedule's contact, pickup facility and destination; who it dispatches and who is
 * alerted. Core's validation keys (and the department's New Call Form Fields) come back worded in the user's language.
 */
export default function RecurringCallFormScreen({ mode }: RecurringCallFormScreenProps) {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const toast = useToast();
  const colors = useThemeColors();
  const isEnabled = useIsRecurringCallsEnabled();
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const isEdit = mode === 'edit';
  // The route decides: a create never edits whatever id it is given, and an edit with a bad id edits nothing.
  const recurringCallId = isEdit ? parseScheduleId(params.id) : null;
  const options = useRecurringCallsStore((state) => state.options);
  const optionsLoaded = useRecurringCallsStore((state) => (state.fetchedAt.options ?? 0) > 0);
  const detail = useRecurringCallsStore((state) => (recurringCallId ? state.details[String(recurringCallId)] : undefined));
  const isSaving = useRecurringCallsStore((state) => state.busyKeys.includes(recurringScheduleKey(recurringCallId ?? 0)));
  const priorities = useCallsStore((state) => state.callPriorities);
  const callTypes = useCallsStore((state) => state.callTypes);
  const pois = usePoisStore((state) => state.pois);
  const destinationPois = usePoisStore((state) => state.destinationPois);
  const poisLoading = usePoisStore((state) => state.loading.pois === true);
  const poisFailed = usePoisStore((state) => !!state.errors.pois);
  const destinationPoisLoading = usePoisStore((state) => state.loading.destinationPois === true);
  const destinationPoisFailed = usePoisStore((state) => !!state.errors.destinationPois);
  const { recipients, isLoading: recipientsLoading } = useDispatchRecipients(isEnabled);
  const { LocationPicker } = useCallFormHookPoints();
  const [values, setValues] = useState<RecurringCallFormValues | null>(null);
  const [loadError, setLoadError] = useState<DataError | null>(null);
  const [optionsReady, setOptionsReady] = useState(false);
  const [errors, setErrors] = useState<RecurringCallErrorData[]>([]);
  const [open, setOpen] = useState<OpenPicker>(null);
  const [newTime, setNewTime] = useState('');
  const locale = i18n?.language ?? 'en';

  // An edit starts from the schedule as the server has it now, never from a cached copy: another dispatcher may have
  // changed it since, and saving the old copy would undo that change. Local edits are kept once it has started.
  const loadSchedule = useCallback(async () => {
    if (!recurringCallId) return;
    setLoadError(null);
    const fresh = await useRecurringCallsStore.getState().fetchRecurringCall(recurringCallId, { bypassCache: true });
    const failure = useRecurringCallsStore.getState().detailErrors[String(recurringCallId)] ?? null;

    if (fresh && !failure) setValues((current) => current ?? scheduleToFormValues(fresh.RecurringCall));
    else setLoadError(failure ?? SCHEDULE_NOT_FOUND);
  }, [recurringCallId]);

  useEffect(() => {
    if (!isEnabled) return undefined;
    let active = true;

    // A new schedule starts from the department's defaults and today as they are now (the session's copy can be from
    // yesterday); an edit only needs the choices.
    void useRecurringCallsStore
      .getState()
      .fetchOptions(!isEdit)
      .finally(() => {
        if (active) setOptionsReady(true);
      });
    void useCallsStore.getState().fetchCallPriorities();
    void useCallsStore.getState().fetchCallTypes();

    if (isEdit) void loadSchedule();

    return () => {
      active = false;
    };
  }, [isEdit, isEnabled, loadSchedule]);

  // A new schedule starts once the options read has settled, so its lead times and start date are the department's.
  useEffect(() => {
    if (values === null && !isEdit && optionsReady) setValues(emptyRecurringCallForm(options, defaultPriorityId(priorities)));
  }, [isEdit, options, optionsReady, priorities, values]);

  // The department's today arrives with the options: a new schedule starts on it unless one was picked.
  useEffect(() => {
    if (!isEdit && options?.Today) setValues((current) => (current && !current.startsOn ? { ...current, startsOn: options.Today ?? '' } : current));
  }, [isEdit, options?.Today]);

  useEffect(() => {
    if (open === 'facility') void usePoisStore.getState().fetchPois();

    if (open === 'destination') void usePoisStore.getState().fetchDestinationPois();
  }, [open]);

  const alertSections = useMemo<RecipientPickerSection<AlertSection>[]>(
    () => [
      { key: 'users', label: t('calls.users'), entries: recipients.personnel.map((person) => ({ id: person.UserId, name: personnelFullName(person) || person.UserId, detail: person.GroupName })) },
      { key: 'groups', label: t('calls.groups'), entries: recipients.groups.map((group) => ({ id: String(group.GroupId), name: group.Name })) },
      { key: 'roles', label: t('calls.roles'), entries: recipients.roles.map((role) => ({ id: String(role.RoleId), name: role.Name })) },
    ],
    [recipients, t]
  );

  // The pickers reset their draft when the value they are given changes: hand them one that changes only with the picks.
  const dispatchTargets = values?.dispatch;
  const alertRecipients = values?.alertRecipients;
  const dispatchSelection = useMemo(() => ({ everyone: false, users: [], groups: [], roles: [], units: [], ...dispatchTargets }), [dispatchTargets]);
  const alertSelection = useMemo(() => ({ everyone: false, ids: alertRecipients ?? {} }), [alertRecipients]);
  // The names behind the picks: read through the whole directory, so only when the picks or the directory change.
  const dispatchNames = useMemo(() => (dispatchTargets ? targetNames(dispatchTargets, recipients) : []), [dispatchTargets, recipients]);
  const alertNames = useMemo(() => (alertRecipients ? targetNames(alertRecipients, recipients) : []), [alertRecipients, recipients]);

  const back = () => router.back();
  const title = isEdit ? t('recurring_calls.edit_title') : t('recurring_calls.new_title');
  const header = <ScreenHeader title={title} onBack={back} />;
  const schedule = detail?.RecurringCall ?? null;

  if (isEdit && isEnabled && !recurringCallId) {
    return (
      <View style={styles.screen} testID="recurring-call-form-screen">
        {header}
        <ZeroState isError heading={t('recurring_calls.not_found')} testID="recurring-call-form-invalid" />
      </View>
    );
  }

  // Off in this app or department: nothing loads, so the edit never waits on a read that does not run.
  if (isEdit && isEnabled && !values) {
    return (
      <View style={styles.screen} testID="recurring-call-form-screen">
        {header}
        {loadError ? (
          <ZeroState
            isError
            heading={loadError.code === 'not_found' ? t('recurring_calls.not_found') : t('common.errorOccurred')}
            description={t(loadError.messageKey)}
            onRetry={loadSchedule}
            testID="recurring-call-form-load-error"
          />
        ) : (
          <Loading text={t('recurring_calls.loading_detail')} />
        )}
      </View>
    );
  }

  // Opened from a link or a stale screen: Core would refuse the save.
  const notAllowed = !isEnabled || (isEdit ? schedule !== null && !schedule.CanManage : optionsLoaded && options?.CanCreate !== true);

  if (notAllowed || !values) {
    return (
      <View style={styles.screen} testID="recurring-call-form-screen">
        {header}
        {notAllowed ? <ZeroState isError heading={t('recurring_calls.form_not_allowed')} description={t('recurring_calls.form_not_allowed_description')} testID="recurring-call-form-not-allowed" /> : <Loading />}
      </View>
    );
  }

  const update = <K extends keyof RecurringCallFormValues>(key: K, value: RecurringCallFormValues[K]) => setValues((current) => (current ? { ...current, [key]: value } : current));
  const errorsFor = (field: RecurringCallFormField): string | null => errors.flatMap((error) => (errorField(error.Key) === field ? [describeSaveError(error, t, options)] : [])).join(' ') || null;
  const dispatcher = values.creationMode === RecurringCallCreationMode.Dispatcher;
  const location = parseCoordinates(values.geoLocationData);
  const point = location.ok ? { latitude: location.latitude, longitude: location.longitude } : null;
  const facilityPoi = values.facilityPoiId === null ? null : (pois.find((poi) => poi.PoiId === values.facilityPoiId) ?? null);
  const destinationPoi = values.destinationPoiId === null ? null : (destinationPois.find((poi) => poi.PoiId === values.destinationPoiId) ?? null);
  const leadChoices = withCurrent(options?.LeadTimeChoices?.length ? options.LeadTimeChoices : FALLBACK_LEAD_CHOICES, values.leadTimeMinutes);
  const alertChoices = withCurrent(options?.ManualAlertChoices?.length ? options.ManualAlertChoices : FALLBACK_ALERT_CHOICES, values.manualAlertMinutes);
  const runCardsEnabled = options?.RunCardsEnabled === true;
  // The schedule keeps its run card choice while the department has run cards off (Core applies it again once they are
  // back on), but nobody is added by a run card meanwhile.
  const dispatchSummary = summarizeNames(dispatchNames, values.useRunCard && runCardsEnabled ? t('recurring_calls.targets_run_card_only') : t('recurring_calls.targets_none'));
  const alertSummary = summarizeNames(alertNames, t('recurring_calls.alert_recipients_owner'));

  const frequencyOptions: ChipOption<RecurringCallFrequency>[] = [
    { value: RecurringCallFrequency.Daily, label: t('recurring_calls.frequency_daily') },
    { value: RecurringCallFrequency.Weekly, label: t('recurring_calls.frequency_weekly') },
    { value: RecurringCallFrequency.Monthly, label: t('recurring_calls.frequency_monthly') },
  ];

  const intervalUnit = values.frequency === RecurringCallFrequency.Daily ? 'days' : values.frequency === RecurringCallFrequency.Monthly ? 'months' : 'weeks';
  const weekdayOptions: ChipOption<number>[] = WEEKDAYS.map((day) => ({ value: day, label: weekdayName(day, locale) }));

  const submit = async () => {
    const clientErrors = validateRecurringCallForm(values, options);

    if (clientErrors.length > 0) {
      setErrors(clientErrors.map((key) => ({ Key: key, Message: null })));
      toast.error(t('recurring_calls.errors.fix_form'));

      return;
    }

    setErrors([]);

    try {
      const saved = await useRecurringCallsStore.getState().saveRecurringCall(toRecurringCallInput(values, recurringCallId ?? 0));
      const savedId = saved?.RecurringCallId ?? recurringCallId;

      toast.success(isEdit ? t('recurring_calls.save_success_edit') : t('recurring_calls.save_success_new', { count: saved?.CreatedCalls ?? 0 }));

      if (isEdit) back();
      else replaceRoutePath(router, savedId ? recurringCallsRoutes.detail(savedId) : recurringCallsRoutes.list());
    } catch (error) {
      const serverErrors = isApiError(error) ? readSaveErrors(error) : [];

      if (serverErrors.length > 0) {
        setErrors(serverErrors);
        toast.error(t('recurring_calls.errors.fix_form'));
      } else {
        toast.error(t('recurring_calls.save_error'));
      }
    }
  };

  const chips = <V extends string | number>(chipOptions: readonly ChipOption<V>[], selected: readonly V[], onToggle: (value: V) => void, testID: string, label: string, mode: 'single' | 'multiple' = 'single') => (
    <OptionChips options={chipOptions} selected={selected} onToggle={onToggle} mode={mode} accessibilityLabel={label} testID={testID} />
  );

  const fieldLabel = (text: string) => (
    <Text size="sm" className="mb-1 text-typography-700">
      {text}
    </Text>
  );

  return (
    <View style={styles.screen} className="bg-background-50" testID="recurring-call-form-screen">
      {header}
      <KeyboardAwareScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" testID="recurring-call-form-scroll">
        {errors.length > 0 ? (
          <View style={styles.errorBox} className="border border-error-300 bg-error-50" accessibilityRole="alert" testID="recurring-call-form-errors">
            <Text className="mb-1 font-semibold text-error-800">{t('recurring_calls.errors.title')}</Text>
            {errors.map((error) => (
              <Text key={error.Key} size="sm" className="text-error-800" testID={`recurring-call-form-error-${error.Key}`}>
                {`• ${describeSaveError(error, t, options)}`}
              </Text>
            ))}
          </View>
        ) : null}

        <FormSection title={t('recurring_calls.section_schedule')} testID="recurring-call-form-schedule">
          <FormTextField label={t('recurring_calls.field_name')} value={values.name} onChange={(text) => update('name', text)} maxLength={500} error={errorsFor('name')} testID="recurring-call-form-name" />
          <FormTextField label={t('recurring_calls.field_description')} value={values.description} onChange={(text) => update('description', text)} multiline maxLength={4000} testID="recurring-call-form-description" />
        </FormSection>

        <FormSection title={t('recurring_calls.section_repeats')} testID="recurring-call-form-pattern">
          {chips(frequencyOptions, [values.frequency], (value) => update('frequency', value), 'recurring-call-form-frequency', t('recurring_calls.section_repeats'))}
          <FormTextField
            label={t(`recurring_calls.repeat_every_${intervalUnit}`)}
            value={values.repeatInterval}
            onChange={(text) => update('repeatInterval', text.replace(/\D/g, ''))}
            keyboardType="number-pad"
            maxLength={2}
            testID="recurring-call-form-interval"
          />
          {values.frequency === RecurringCallFrequency.Weekly ? (
            <View style={styles.field}>
              {fieldLabel(t('recurring_calls.field_days'))}
              {chips(
                weekdayOptions,
                values.days,
                (day) => update('days', values.days.includes(day) ? values.days.filter((entry) => entry !== day) : [...values.days, day]),
                'recurring-call-form-days',
                t('recurring_calls.field_days'),
                'multiple'
              )}
            </View>
          ) : null}
          {values.frequency === RecurringCallFrequency.Monthly ? (
            <View style={styles.field}>
              {chips<MonthlyMode>(
                [
                  { value: 'date', label: t('recurring_calls.monthly_by_date') },
                  { value: 'weekday', label: t('recurring_calls.monthly_by_weekday') },
                ],
                [values.monthlyMode],
                (mode) => update('monthlyMode', mode),
                'recurring-call-form-monthly-mode',
                t('recurring_calls.section_repeats')
              )}
              {values.monthlyMode === 'date' ? (
                <FormTextField
                  label={t('recurring_calls.field_monthly_day')}
                  value={values.monthlyDay}
                  onChange={(text) => update('monthlyDay', text.replace(/\D/g, ''))}
                  keyboardType="number-pad"
                  maxLength={2}
                  testID="recurring-call-form-monthly-day"
                />
              ) : (
                <>
                  {fieldLabel(t('recurring_calls.field_monthly_week'))}
                  {chips(
                    [...WEEK_ORDINAL_KEYS.entries()].map(([week, key]) => ({ value: week, label: t(key) })),
                    [values.monthlyWeek],
                    (week) => update('monthlyWeek', week),
                    'recurring-call-form-monthly-week',
                    t('recurring_calls.field_monthly_week')
                  )}
                  {fieldLabel(t('recurring_calls.field_monthly_weekday'))}
                  {chips(weekdayOptions, [values.monthlyWeekday], (day) => update('monthlyWeekday', day), 'recurring-call-form-monthly-weekday', t('recurring_calls.field_monthly_weekday'))}
                </>
              )}
            </View>
          ) : null}
          {errorsFor('pattern') ? <FieldError message={errorsFor('pattern') ?? ''} testID="recurring-call-form-pattern-error" /> : null}
        </FormSection>

        <FormSection title={t('recurring_calls.section_times')} description={options?.TimeZone ? t('recurring_calls.times_hint', { zone: options.TimeZone }) : null} testID="recurring-call-form-times">
          <View style={styles.chipRow}>
            {values.times.map((time) => (
              <Pressable
                key={time}
                onPress={() =>
                  update(
                    'times',
                    values.times.filter((entry) => entry !== time)
                  )
                }
                accessibilityRole="button"
                accessibilityLabel={t('recurring_calls.remove_time', { time })}
                className="mb-2 mr-2 flex-row items-center rounded-full border border-primary-600 bg-primary-100 px-3 py-1.5"
                testID={`recurring-call-form-time-${time}`}
              >
                <Text size="sm" className="mr-1 font-semibold text-primary-800">
                  {time}
                </Text>
                <View>
                  <X size={14} color={colors.primary} />
                </View>
              </Pressable>
            ))}
          </View>
          <DateTimeField
            value={newTime}
            onChange={(time) => {
              update('times', addTime(values.times, time));
              setNewTime('');
            }}
            label={t('recurring_calls.add_time')}
            mode="time"
            testID="recurring-call-form-add-time"
          />
          {errorsFor('times') ? <FieldError message={errorsFor('times') ?? ''} testID="recurring-call-form-times-error" /> : null}
        </FormSection>

        <FormSection title={t('recurring_calls.section_dates')} testID="recurring-call-form-dates">
          {fieldLabel(t('recurring_calls.field_starts_on'))}
          <DateTimeField value={values.startsOn} onChange={(date) => update('startsOn', date)} label={t('recurring_calls.field_starts_on')} mode="date" clearable={false} testID="recurring-call-form-starts-on" />
          <View style={styles.spacer} />
          {fieldLabel(t('recurring_calls.field_ends_on'))}
          <DateTimeField value={values.endsOn} onChange={(date) => update('endsOn', date)} label={t('recurring_calls.ends_never')} mode="date" testID="recurring-call-form-ends-on" />
          {errorsFor('dates') ? <FieldError message={errorsFor('dates') ?? ''} testID="recurring-call-form-dates-error" /> : null}
        </FormSection>

        <FormSection title={t('recurring_calls.section_mode')} testID="recurring-call-form-mode">
          {chips(
            [
              { value: RecurringCallCreationMode.Automatic, label: t('recurring_calls.mode_automatic') },
              { value: RecurringCallCreationMode.Dispatcher, label: t('recurring_calls.mode_dispatcher') },
            ],
            [values.creationMode],
            (mode) => update('creationMode', mode),
            'recurring-call-form-creation-mode',
            t('recurring_calls.section_mode')
          )}
          <Text size="xs" className="mb-2 text-typography-500" testID="recurring-call-form-mode-hint">
            {dispatcher ? t('recurring_calls.mode_dispatcher_hint') : t('recurring_calls.mode_automatic_hint')}
          </Text>
          {dispatcher ? (
            <View style={styles.field}>
              {fieldLabel(t('recurring_calls.field_alert_lead'))}
              {chips(
                alertChoices.map((minutes) => ({ value: minutes, label: formatAlertLead(minutes, t) })),
                [values.manualAlertMinutes],
                (minutes) => update('manualAlertMinutes', minutes),
                'recurring-call-form-alert-lead',
                t('recurring_calls.field_alert_lead')
              )}
            </View>
          ) : (
            <View style={styles.field}>
              {fieldLabel(t('recurring_calls.field_lead_time'))}
              {chips(
                leadChoices.map((minutes) => ({ value: minutes, label: formatMinutes(minutes, t) })),
                [values.leadTimeMinutes],
                (minutes) => update('leadTimeMinutes', minutes),
                'recurring-call-form-lead-time',
                t('recurring_calls.field_lead_time')
              )}
            </View>
          )}
          <FormSwitchRow
            label={t('recurring_calls.field_use_run_card')}
            value={values.useRunCard}
            onChange={(value) => update('useRunCard', value)}
            disabled={!runCardsEnabled}
            hint={runCardsEnabled ? t('recurring_calls.run_card_hint') : t('recurring_calls.run_card_disabled_hint')}
            testID="recurring-call-form-run-card"
          />
          {errorsFor('mode') ? <FieldError message={errorsFor('mode') ?? ''} testID="recurring-call-form-mode-error" /> : null}
        </FormSection>

        <FormSection title={t('recurring_calls.section_who')} testID="recurring-call-form-who">
          {fieldLabel(t('recurring_calls.field_dispatch_targets'))}
          <Pressable
            onPress={() => setOpen('dispatch')}
            accessibilityRole="button"
            accessibilityLabel={`${t('recurring_calls.field_dispatch_targets')}: ${dispatchSummary}`}
            style={styles.pickerRow}
            className="border-outline-200"
            testID="recurring-call-form-dispatch"
          >
            <View className="mr-2">
              <Users size={16} color={colors.icon} />
            </View>
            <Text className="flex-1 text-typography-800" numberOfLines={2}>
              {dispatchSummary}
            </Text>
          </Pressable>
          <Text size="xs" className="mb-3 mt-1 text-typography-500">
            {t('recurring_calls.dispatch_targets_hint')}
          </Text>
          {fieldLabel(t('recurring_calls.field_alert_recipients'))}
          <Pressable
            onPress={() => setOpen('alerts')}
            accessibilityRole="button"
            accessibilityLabel={`${t('recurring_calls.field_alert_recipients')}: ${alertSummary}`}
            style={styles.pickerRow}
            className="border-outline-200"
            testID="recurring-call-form-alerts"
          >
            <View className="mr-2">
              <Users size={16} color={colors.icon} />
            </View>
            <Text className="flex-1 text-typography-800" numberOfLines={2}>
              {alertSummary}
            </Text>
          </Pressable>
        </FormSection>

        <FormSection title={t('recurring_calls.section_call')} description={t('recurring_calls.section_call_hint')} testID="recurring-call-form-call">
          <FormTextField label={t('recurring_calls.field_nature')} value={values.natureOfCall} onChange={(text) => update('natureOfCall', text)} multiline testID="recurring-call-form-nature" />
          <FormTextField label={t('recurring_calls.field_address')} value={values.address} onChange={(text) => update('address', text)} testID="recurring-call-form-address" />
          <View style={styles.inlineRow}>
            <Text size="sm" className="flex-1 text-typography-600" testID="recurring-call-form-location">
              {point ? t('recurring_calls.location_set', { latitude: point.latitude.toFixed(5), longitude: point.longitude.toFixed(5) }) : t('recurring_calls.location_none')}
            </Text>
            {LocationPicker ? <ActionButton label={t('recurring_calls.pick_on_map')} icon={MapPin} tone="secondary" onPress={() => setOpen('location')} testID="recurring-call-form-pick-location" /> : null}
            {point ? <ActionButton label={t('recurring_calls.clear')} icon={X} tone="secondary" onPress={() => update('geoLocationData', '')} testID="recurring-call-form-clear-location" /> : null}
          </View>
          <View style={styles.field}>
            {fieldLabel(t('recurring_calls.field_priority'))}
            {chips(
              priorityOptions(priorities).map((priority) => ({ value: priority.id, label: priority.isLabelKey ? t(priority.label) : priority.label, color: priority.color })),
              [values.priority],
              (priority) => update('priority', priority),
              'recurring-call-form-priority',
              t('recurring_calls.field_priority')
            )}
          </View>
          {callTypes.length > 0 ? (
            <View style={styles.field}>
              {fieldLabel(t('recurring_calls.field_type'))}
              {chips(
                [{ value: '', label: t('recurring_calls.type_none') }, ...callTypes.map((type) => ({ value: type.Name, label: type.Name }))],
                [values.type],
                (type) => update('type', type),
                'recurring-call-form-type',
                t('recurring_calls.field_type')
              )}
            </View>
          ) : null}
          <FormTextField label={t('recurring_calls.field_call_contact_name')} value={values.contactName} onChange={(text) => update('contactName', text)} testID="recurring-call-form-contact-name" />
          <FormTextField
            label={t('recurring_calls.field_call_contact_number')}
            value={values.contactNumber}
            onChange={(text) => update('contactNumber', text)}
            keyboardType="phone-pad"
            testID="recurring-call-form-contact-number"
          />
          {fieldLabel(t('recurring_calls.field_destination_poi'))}
          <Pressable onPress={() => setOpen('destination')} accessibilityRole="button" style={styles.pickerRow} className="mb-3 border-outline-200" testID="recurring-call-form-destination-poi">
            <Text className="flex-1 text-typography-800" numberOfLines={1}>
              {values.destinationPoiId === null ? t('recurring_calls.poi_none') : (destinationPoi?.Name ?? `#${values.destinationPoiId}`)}
            </Text>
          </Pressable>
          <FormTextField label={t('recurring_calls.field_reference_number')} value={values.referenceNumber} onChange={(text) => update('referenceNumber', text)} testID="recurring-call-form-reference" />
          <FormTextField label={t('recurring_calls.field_incident_number')} value={values.incidentNumber} onChange={(text) => update('incidentNumber', text)} testID="recurring-call-form-incident" />
          <FormTextField label={t('recurring_calls.field_external_identifier')} value={values.externalIdentifier} onChange={(text) => update('externalIdentifier', text)} testID="recurring-call-form-external" />
          <FormTextField label={t('recurring_calls.field_map_page')} value={values.mapPage} onChange={(text) => update('mapPage', text)} testID="recurring-call-form-map-page" />
          <FormTextField label={t('recurring_calls.field_notes')} value={values.notes} onChange={(text) => update('notes', text)} multiline testID="recurring-call-form-notes" />
          <FormSwitchRow label={t('recurring_calls.field_check_in_timers')} value={values.checkInTimersEnabled} onChange={(value) => update('checkInTimersEnabled', value)} testID="recurring-call-form-check-in-timers" />
          {errorsFor('call') ? <FieldError message={errorsFor('call') ?? ''} testID="recurring-call-form-call-error" /> : null}
        </FormSection>

        <FormSection title={t('recurring_calls.section_details')} description={t('recurring_calls.section_details_hint')} testID="recurring-call-form-details">
          <FormTextField
            label={t('recurring_calls.field_schedule_contact_name')}
            value={values.scheduleContactName}
            onChange={(text) => update('scheduleContactName', text)}
            maxLength={500}
            testID="recurring-call-form-schedule-contact-name"
          />
          <FormTextField
            label={t('recurring_calls.field_schedule_contact_number')}
            value={values.scheduleContactNumber}
            onChange={(text) => update('scheduleContactNumber', text)}
            keyboardType="phone-pad"
            maxLength={100}
            testID="recurring-call-form-schedule-contact-number"
          />
          <FormTextField
            label={t('recurring_calls.field_schedule_contact_email')}
            value={values.scheduleContactEmail}
            onChange={(text) => update('scheduleContactEmail', text)}
            keyboardType="email-address"
            maxLength={256}
            error={errorsFor('contact')}
            testID="recurring-call-form-schedule-contact-email"
          />
          <FormTextField label={t('recurring_calls.field_facility_name')} value={values.facilityName} onChange={(text) => update('facilityName', text)} maxLength={500} testID="recurring-call-form-facility-name" />
          <FormTextField
            label={t('recurring_calls.field_facility_details')}
            value={values.facilityDetails}
            onChange={(text) => update('facilityDetails', text)}
            multiline
            maxLength={2000}
            testID="recurring-call-form-facility-details"
          />
          {fieldLabel(t('recurring_calls.field_facility_poi'))}
          <Pressable onPress={() => setOpen('facility')} accessibilityRole="button" style={styles.pickerRow} className="mb-3 border-outline-200" testID="recurring-call-form-facility-poi">
            <Text className="flex-1 text-typography-800" numberOfLines={1}>
              {values.facilityPoiId === null ? t('recurring_calls.poi_none') : (facilityPoi?.Name ?? `#${values.facilityPoiId}`)}
            </Text>
          </Pressable>
          <FormTextField
            label={t('recurring_calls.field_destination_name')}
            value={values.destinationName}
            onChange={(text) => update('destinationName', text)}
            maxLength={500}
            testID="recurring-call-form-destination-name"
          />
          <FormTextField
            label={t('recurring_calls.field_destination_details')}
            value={values.destinationDetails}
            onChange={(text) => update('destinationDetails', text)}
            multiline
            maxLength={2000}
            testID="recurring-call-form-destination-details"
          />
        </FormSection>

        <FormSection title={t('recurring_calls.section_save')} testID="recurring-call-form-save-options">
          {isEdit ? (
            <FormSwitchRow
              label={t('recurring_calls.field_replace_upcoming')}
              value={values.replaceUpcomingCalls}
              onChange={(value) => update('replaceUpcomingCalls', value)}
              hint={t('recurring_calls.replace_upcoming_hint')}
              testID="recurring-call-form-replace-upcoming"
            />
          ) : (
            <FormSwitchRow
              label={t('recurring_calls.field_start_paused')}
              value={values.startPaused}
              onChange={(value) => update('startPaused', value)}
              hint={t('recurring_calls.start_paused_hint')}
              testID="recurring-call-form-start-paused"
            />
          )}
          <Button onPress={() => void submit()} isDisabled={isSaving} accessibilityLabel={isEdit ? t('recurring_calls.save') : t('recurring_calls.create')} testID="recurring-call-form-submit">
            {isSaving ? <ButtonSpinner /> : <ButtonText>{isEdit ? t('recurring_calls.save') : t('recurring_calls.create')}</ButtonText>}
          </Button>
        </FormSection>
      </KeyboardAwareScrollView>

      <DispatchSelectionModal
        isOpen={open === 'dispatch'}
        onClose={() => setOpen(null)}
        recipients={recipients}
        value={dispatchSelection}
        allowEveryone={false}
        callLocation={point}
        onConfirm={(selection) => {
          update('dispatch', { users: selection.users, groups: selection.groups, roles: selection.roles, units: selection.units });
          setOpen(null);
        }}
      />
      <RecipientPickerModal<AlertSection>
        isOpen={open === 'alerts'}
        onClose={() => setOpen(null)}
        title={t('recurring_calls.field_alert_recipients')}
        sections={alertSections}
        value={alertSelection}
        onConfirm={(selection) => {
          update('alertRecipients', { users: [...(selection.ids.users ?? [])], groups: [...(selection.ids.groups ?? [])], roles: [...(selection.ids.roles ?? [])] });
          setOpen(null);
        }}
        everyoneLabel={null}
        everyoneName={t('recurring_calls.alert_recipients_owner')}
        isLoading={recipientsLoading}
        testID="recurring-call-alert-picker"
        optionTestID="recurring-call-alert-option"
      />
      <PoiPickerModal
        isOpen={open === 'facility'}
        onClose={() => setOpen(null)}
        title={t('recurring_calls.field_facility_poi')}
        pois={pois}
        selectedId={values.facilityPoiId}
        onSelect={(poi) => {
          setValues((current) => (current ? { ...current, facilityPoiId: poi?.PoiId ?? null, facilityName: nameForPoi(current.facilityName, facilityPoi, poi) } : current));
          setOpen(null);
        }}
        isLoading={poisLoading}
        loadFailed={poisFailed}
        onRetry={() => void usePoisStore.getState().fetchPois({ bypassCache: true })}
        testID="recurring-call-facility-picker"
      />
      <PoiPickerModal
        isOpen={open === 'destination'}
        onClose={() => setOpen(null)}
        title={t('recurring_calls.field_destination_poi')}
        pois={destinationPois}
        selectedId={values.destinationPoiId}
        onSelect={(poi) => {
          setValues((current) => (current ? { ...current, destinationPoiId: poi?.PoiId ?? null, destinationName: nameForPoi(current.destinationName, destinationPoi, poi) } : current));
          setOpen(null);
        }}
        isLoading={destinationPoisLoading}
        loadFailed={destinationPoisFailed}
        onRetry={() => void usePoisStore.getState().fetchDestinationPois({ bypassCache: true })}
        testID="recurring-call-destination-picker"
      />
      {LocationPicker ? (
        <LocationPicker
          isOpen={open === 'location'}
          onClose={() => setOpen(null)}
          initial={point}
          onSelect={(picked) => {
            setValues((current) =>
              current ? { ...current, geoLocationData: `${picked.latitude.toFixed(6)},${picked.longitude.toFixed(6)}`, address: current.address.trim() ? current.address : (picked.address ?? current.address) } : current
            );
            setOpen(null);
          }}
        />
      ) : null}
    </View>
  );
}

/** `/recurring-calls/new`: a new schedule, whatever the link carries. */
export const RecurringCallCreateScreen: React.FC = () => <RecurringCallFormScreen mode="create" />;

/**
 * `/recurring-calls/[id]/edit`: the schedule the id names. Another schedule is another form: when the router reuses the
 * screen for a new id, nothing of the last schedule (its values, a read still out for it) carries over.
 */
export const RecurringCallEditScreen: React.FC = () => {
  const { id } = useLocalSearchParams<{ id?: string | string[] }>();

  return <RecurringCallFormScreen key={Array.isArray(id) ? id[0] : id} mode="edit" />;
};

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { padding: 12, paddingBottom: 32 },
  errorBox: { borderRadius: 12, padding: 12, marginBottom: 12 },
  field: { marginBottom: 12 },
  spacer: { height: 12 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap' },
  inlineRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', marginBottom: 12 },
  pickerRow: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10 },
});
