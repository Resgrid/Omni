import { availabilityLabelKey, type DestinationOrigin, poiAvailabilityStatus } from '@resgrid/features/pois/lib/poi-availability';
import { useTranslation } from '@resgrid/i18n';
import { type CallResultData, PoiAvailabilityStatuses } from '@resgrid/models';
import { Button, ButtonText, CustomBottomSheet, getBottomSheetHeight, HStack, Pressable, ScrollView, Spinner, Text, Textarea, TextareaInput, useThemeColors, useToast, VStack } from '@resgrid/ui';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, useWindowDimensions } from 'react-native';

import {
  destinationLabel,
  type DestinationLists,
  type DestinationTab,
  findPoiById,
  getDestinationTabs,
  isTransportBaseType,
  isTransportDestinationDeviation,
  isTransportReasonRequired,
  NO_DESTINATION,
  resolveAssignedDestinationPoi,
  resolveEffectiveDestination,
  type StatusDestination,
  toRespondingTo,
} from '../lib/status-destination';
import {
  canSubmitStatusWithoutInput,
  type CurrentStatusRef,
  getOfferedStatuses,
  getStatusPickerSteps,
  hasNoteStep,
  isNoteRequired,
  resolveCurrentStatusId,
  statusDetailType,
  type StatusOption,
  type StatusPickerStep,
  toOptionId,
} from '../lib/status-flow';
import { StatusSubmitError } from '../lib/status-submit-error';
import { HoldToConfirmButton } from './hold-to-confirm-button';
import { StatusDestinationList } from './status-destination-list';
import { StatusOptionRow } from './status-option';

export type StatusPickerSubject = 'unit' | 'personnel';

export type StatusPickerTab = 'status' | 'staffing';

/** The data layer's write outcome: sent now, queued for reconnect, or refused by the server. */
export type StatusSubmitOutcome = 'sent' | 'queued' | 'rejected';

export interface StatusSelection {
  status: StatusOption;
  destination: StatusDestination;
  respondingTo: string;
  respondingToType: number | null;
  note: string;
}

export interface StaffingSelection {
  staffing: StatusOption;
  note: string;
}

export interface StatusPickerProps {
  isOpen: boolean;
  onClose: () => void;
  subject: StatusPickerSubject;
  /** The unit or person the status is set for, shown when setting it on someone's behalf. */
  subjectName?: string;
  isOnBehalf?: boolean;
  statuses: readonly StatusOption[];
  current?: CurrentStatusRef | null;
  staffingOptions?: readonly StatusOption[];
  currentStaffing?: CurrentStatusRef | null;
  /** Shows the staffing tab (capabilities.status.staffing, personnel subject). */
  showStaffing?: boolean;
  initialTab?: StatusPickerTab;
  /** A status chosen before the sheet opened (home and sidebar status buttons): the sheet skips the list and opens on its next step. */
  initialStatusId?: number | string | null;
  /** When true with `initialStatusId`, acts as if that status had just been held (sidebar hold-to-confirm buttons). */
  initialHoldConfirmed?: boolean;
  destinations?: DestinationLists;
  isLoadingDestinations?: boolean;
  /** The call a status defaults to (active call, else the call the current status points at). */
  defaultCall?: CallResultData | null;
  /** True while a default call may still arrive with the destination lists (submits wait for them). */
  hasPotentialDefaultCall?: boolean;
  /**
   * A call chosen before the sheet opened (Unit "Set Active" on a call's detail). It replaces `defaultCall`, the sheet
   * has no destination step (every status that takes a call sends this one), and every status gets the note step, so
   * the sheet asks for the status, then a note.
   */
  fixedCall?: CallResultData | null;
  /** Unit's rule: older call-only Detail values also offer stations and POIs. */
  lenientDestinations?: boolean;
  /** Department "Hold to set status" (config StatusHoldToConfirm): statuses are held on the list, and the last step saves on a hold. */
  holdToConfirm?: boolean;
  /**
   * Department "Transport destination checks" (config TransportDestinationChecks): a unit's transport status to a POI other
   * than its call's assigned destination needs a reason, entered as the note. The assigned destination is pre-selected and
   * a different one is flagged either way.
   */
  transportDestinationChecks?: boolean;
  /**
   * The POI the unit is already transporting to (`getCurrentTransportPoiId`): pre-selected before the call's assigned
   * destination, and going there again needs no new reason.
   */
  currentTransportPoiId?: number | string | null;
  /** The unit's last position: POI destinations are ranked nearest first from it (drive times for the closest). */
  destinationOrigin?: DestinationOrigin | null;
  /** The unit whose travel mode and vehicle limits apply to the drive times. */
  destinationUnitId?: string | number | null;
  onSubmitStatus: (selection: StatusSelection) => Promise<StatusSubmitOutcome>;
  onSubmitStaffing?: (selection: StaffingSelection) => Promise<StatusSubmitOutcome>;
  testID?: string;
}

const EMPTY_LISTS: DestinationLists = { calls: [], stations: [], pois: [] };
const SHEET_SNAP_POINT = 80;

/** Room the list leaves in the sheet for the title, tabs, summary, hint and buttons (a two-line title included). */
const SHEET_CHROME_HEIGHT = 300;
const LIST_MIN_HEIGHT = 120;

/**
 * The one status picker for all five apps (omni-plan §7.10): Unit's status sheet (destinations, status flow,
 * hold-to-confirm), Responder's personnel status and staffing sheets and Dispatch's on-behalf sheets. It is
 * presentational: callers pass the options, destinations and a submit handler (see UnitStatusSheet and
 * PersonnelStatusSheet, which bind it to the data stores and the outbox).
 *
 * Steps (getStatusPickerSteps): select → destination (when the status Detail offers any) → note (when its Note type
 * asks for one); the last step submits. A status passed in as `initialStatusId` skips the list and opens on its
 * destination, else its note, else a confirm step. In the department's hold mode the last step saves on a hold, not a
 * tap (Responder and Unit). Meaning is read from BaseType and Detail/Note — never from a status id or its text.
 */
export const StatusPicker: React.FC<StatusPickerProps> = ({
  isOpen,
  onClose,
  subject,
  subjectName,
  isOnBehalf = false,
  statuses,
  current,
  staffingOptions = [],
  currentStaffing,
  showStaffing = false,
  initialTab = 'status',
  initialStatusId = null,
  initialHoldConfirmed = false,
  destinations = EMPTY_LISTS,
  isLoadingDestinations = false,
  defaultCall: listDefaultCall = null,
  hasPotentialDefaultCall: listMayHaveDefaultCall = false,
  fixedCall = null,
  lenientDestinations = false,
  holdToConfirm = false,
  transportDestinationChecks = false,
  currentTransportPoiId = null,
  destinationOrigin = null,
  destinationUnitId = null,
  onSubmitStatus,
  onSubmitStaffing,
  testID = 'status-picker',
}) => {
  const { t } = useTranslation();
  const toast = useToast();
  const colors = useThemeColors();
  const { height: windowHeight } = useWindowDimensions();
  // The list scrolls within what the sheet has left once everything else is laid out. Uncapped, a long list (a busy day's
  // calls) grows past the sheet and pushes the buttons off its bottom, and it takes the drag that would scroll the sheet.
  const listMaxHeight = Math.max(LIST_MIN_HEIGHT, getBottomSheetHeight(windowHeight, SHEET_SNAP_POINT) - SHEET_CHROME_HEIGHT);

  const [tab, setTab] = useState<StatusPickerTab>(initialTab);
  // null = the first step, which a preset status only knows once its option has loaded.
  const [step, setStep] = useState<StatusPickerStep | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedStaffingId, setSelectedStaffingId] = useState<string | null>(null);
  const [selection, setSelection] = useState<StatusDestination>(NO_DESTINATION);
  const [hasExplicitChoice, setHasExplicitChoice] = useState(false);
  const [destinationTab, setDestinationTab] = useState<DestinationTab>('call');
  const [note, setNote] = useState('');
  const [showAll, setShowAll] = useState(false);
  const [holdPending, setHoldPending] = useState(false);
  const [isHoldHintVisible, setIsHoldHintVisible] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Re-entry guard: a double tap within one frame must not send twice; a submission that outlives its open is ignored.
  const pendingRef = useRef<number | null>(null);
  const counterRef = useRef(0);

  // Every open (and close) starts clean: the sheet may stay mounted at the root between uses.
  useEffect(() => {
    pendingRef.current = null;
    setTab(showStaffing ? initialTab : 'status');
    setStep(null);
    setSelectedId(isOpen && initialStatusId != null ? toOptionId(initialStatusId) : null);
    setSelectedStaffingId(null);
    setSelection(NO_DESTINATION);
    setHasExplicitChoice(false);
    setNote('');
    setShowAll(false);
    setHoldPending(isOpen && initialStatusId != null && initialHoldConfirmed);
    setIsHoldHintVisible(false);
    setIsSubmitting(false);
    setError(null);
  }, [isOpen, initialStatusId, initialHoldConfirmed, initialTab, showStaffing]);

  const isStaffingTab = showStaffing && tab === 'staffing';
  const currentStatusId = useMemo(() => resolveCurrentStatusId(statuses, current), [current, statuses]);
  const currentStaffingId = useMemo(() => resolveCurrentStatusId(staffingOptions, currentStaffing), [currentStaffing, staffingOptions]);
  const offered = useMemo(() => getOfferedStatuses(statuses, currentStatusId, showAll), [currentStatusId, showAll, statuses]);
  const hasNextRestriction = useMemo(() => showAll && getOfferedStatuses(statuses, currentStatusId, false).isRestricted, [currentStatusId, showAll, statuses]);

  const selectedStatus = useMemo(() => statuses.find((option) => toOptionId(option.Id) === selectedId) ?? null, [selectedId, statuses]);
  const selectedStaffing = useMemo(() => staffingOptions.find((option) => toOptionId(option.Id) === selectedStaffingId) ?? null, [selectedStaffingId, staffingOptions]);

  // A fixed call is the default for every status and needs no destination lists to arrive.
  const defaultCall = fixedCall ?? listDefaultCall;
  const hasPotentialDefaultCall = fixedCall ? false : listMayHaveDefaultCall;
  const detail = statusDetailType(selectedStatus);
  const destinationTabs = useMemo(() => (detail > 0 ? getDestinationTabs(detail, lenientDestinations) : []), [detail, lenientDestinations]);
  const hasDestinationStep = destinationTabs.length > 0 && !fixedCall;
  const allowsCalls = destinationTabs.includes('call');

  // Transport destination checks (units only, as the server records them): a Transporting / At Hospital status starts on
  // the default call's assigned destination, and another POI is a deviation. A fixed call has no destination step.
  const isTransportStatus = subject === 'unit' && !fixedCall && !isStaffingTab && isTransportBaseType(selectedStatus?.BaseType);
  const assignedPoi = useMemo(() => (isTransportStatus ? resolveAssignedDestinationPoi(defaultCall, destinations.pois) : null), [defaultCall, destinations.pois, isTransportStatus]);
  // The hospital the unit already reported going to wins over the call's (a crew that changed hospital keeps it).
  const currentTransportPoi = useMemo(() => (isTransportStatus ? findPoiById(destinations.pois, currentTransportPoiId) : null), [currentTransportPoiId, destinations.pois, isTransportStatus]);
  const defaultPoi = currentTransportPoi ?? assignedPoi;
  const hasDefaultPoi = !!defaultPoi && destinationTabs.includes('poi');

  const effectiveDestination = useMemo(
    () => (selectedStatus ? resolveEffectiveDestination({ detail, lenient: lenientDestinations, selection, hasExplicitChoice, defaultCall, defaultPoi }) : NO_DESTINATION),
    [defaultCall, defaultPoi, detail, hasExplicitChoice, lenientDestinations, selectedStatus, selection]
  );

  const isDeviation = isTransportStatus && isTransportDestinationDeviation(selectedStatus?.BaseType, effectiveDestination, assignedPoi);
  const reasonRequired = isTransportReasonRequired(transportDestinationChecks, isDeviation, effectiveDestination, currentTransportPoi);
  // A hospital on diversion or closed is said plainly before the crew heads there (it is not refused: they may have no alternative).
  const chosenAvailability = effectiveDestination.type === 'poi' ? poiAvailabilityStatus(effectiveDestination.poi) : PoiAvailabilityStatuses.Open;
  const assignedPoiLabel = assignedPoi ? destinationLabel({ type: 'poi', poi: assignedPoi }, t('data_protection.protected_value')) : '';

  // Before a status is picked, a fixed call is what the sheet is for.
  const summaryDestination = useMemo<StatusDestination>(() => (selectedStatus || !fixedCall ? effectiveDestination : { type: 'call', call: fixedCall }), [effectiveDestination, fixedCall, selectedStatus]);

  const isAwaitingDestinations = isLoadingDestinations && (hasDestinationStep || hasPotentialDefaultCall);

  // A required reason for a different destination adds the note step to a status that has none.
  const noteRequired = isStaffingTab ? isNoteRequired(selectedStaffing) : isNoteRequired(selectedStatus) || reasonRequired;
  const optionHasNoteStep = isStaffingTab ? hasNoteStep(selectedStaffing) : !!fixedCall || hasNoteStep(selectedStatus) || reasonRequired;
  // The status passed in skips the list once its option has loaded (were it missing, the list lets the user pick another).
  const hasPresetStatus = initialStatusId != null && selectedStatus !== null && selectedId === toOptionId(initialStatusId);

  const steps = useMemo(
    () => getStatusPickerSteps({ isStaffing: isStaffingTab, hasPresetStatus, hasDestinationStep, hasNoteStep: optionHasNoteStep }),
    [hasDestinationStep, hasPresetStatus, isStaffingTab, optionHasNoteStep]
  );

  // A step the selection no longer has (its options changed under the open sheet) falls back to the first.
  const currentStep = step !== null && steps.includes(step) ? step : steps[0];
  const stepIndex = steps.indexOf(currentStep);
  const isFirstStep = stepIndex === 0;
  const isLastStep = stepIndex === steps.length - 1;

  // The destination tab follows the selected status: the tab holding the default/selected destination, else the first.
  useEffect(() => {
    if (destinationTabs.length === 0) return;
    const preferred = effectiveDestination.type !== 'none' && destinationTabs.includes(effectiveDestination.type) ? effectiveDestination.type : destinationTabs[0];
    setDestinationTab(preferred);
    // Only when the status changes (or its assigned destination arrives with the lists): later manual tab taps must win.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, destinationTabs.length, defaultPoi?.PoiId]);

  const finish = useCallback(
    (outcome: StatusSubmitOutcome) => {
      if (outcome === 'rejected') {
        setError(t('status.failed_to_save_status'));
        toast.error(t('status.failed_to_save_status'));

        return;
      }

      if (outcome === 'queued') toast.warning(t('status.status_queued'));
      else toast.success(t('status.status_saved_successfully'));
      onClose();
    },
    [onClose, t, toast]
  );

  const run = useCallback(
    async (submit: () => Promise<StatusSubmitOutcome>) => {
      if (pendingRef.current !== null) return;
      const id = ++counterRef.current;
      pendingRef.current = id;
      setIsSubmitting(true);
      setError(null);

      try {
        const outcome = await submit();

        if (pendingRef.current === id) finish(outcome);
      } catch (caught) {
        if (pendingRef.current === id) {
          const message = caught instanceof StatusSubmitError ? caught.message : t('status.failed_to_save_status');
          setError(message);
          toast.error(message);
        }
      } finally {
        if (pendingRef.current === id) {
          pendingRef.current = null;
          setIsSubmitting(false);
        }
      }
    },
    [finish, t, toast]
  );

  const submitStatus = useCallback(() => {
    if (!selectedStatus || isAwaitingDestinations) return;
    const destination = effectiveDestination;
    void run(() => onSubmitStatus({ status: selectedStatus, destination, ...toRespondingTo(destination), note: note.trim() }));
  }, [effectiveDestination, isAwaitingDestinations, note, onSubmitStatus, run, selectedStatus]);

  const submitStaffing = useCallback(() => {
    if (!selectedStaffing || !onSubmitStaffing) return;
    void run(() => onSubmitStaffing({ staffing: selectedStaffing, note: note.trim() }));
  }, [note, onSubmitStaffing, run, selectedStaffing]);

  // A completed hold acts once the status is selected and the lists it may default from have landed: it saves when
  // nothing else is needed, and otherwise opens the step that still needs the user.
  useEffect(() => {
    if (!isOpen || !holdPending || !selectedStatus || isSubmitting || isAwaitingDestinations) return;
    setHoldPending(false);
    const nextStep = steps.find((value) => value !== 'select');

    // With a fixed call the hold picks the status and the note step follows: that sheet always offers a note.
    if (!nextStep || (!fixedCall && canSubmitStatusWithoutInput(selectedStatus, { allowsCalls, hasDefaultCall: !!defaultCall, hasDefaultPoi }))) {
      submitStatus();

      return;
    }

    setStep(nextStep);
  }, [allowsCalls, defaultCall, fixedCall, hasDefaultPoi, holdPending, isAwaitingDestinations, isOpen, isSubmitting, selectedStatus, steps, submitStatus]);

  const handleSelectStatus = useCallback((option: StatusOption) => {
    setSelectedId(toOptionId(option.Id));
    setSelection(NO_DESTINATION);
    setHasExplicitChoice(false);
    setError(null);
  }, []);

  const handleHoldStatus = useCallback(
    (option: StatusOption) => {
      if (pendingRef.current !== null) return;
      handleSelectStatus(option);
      setIsHoldHintVisible(false);
      setHoldPending(true);
    },
    [handleSelectStatus]
  );

  const handleSelectStaffing = useCallback((option: StatusOption) => {
    setSelectedStaffingId(toOptionId(option.Id));
    setError(null);
  }, []);

  const handleSelectDestination = useCallback((destination: StatusDestination) => {
    setHasExplicitChoice(true);
    setSelection(destination);
  }, []);

  const handleClose = useCallback(() => {
    // Closing mid-submit would not cancel the save; like Cancel, it waits.
    if (pendingRef.current !== null) return;
    onClose();
  }, [onClose]);

  const hasSelection = isStaffingTab ? !!selectedStaffing : !!selectedStatus;
  const canProceed = hasSelection && !isSubmitting && (currentStep !== 'note' || !noteRequired || note.trim().length > 0) && (isStaffingTab || !isLastStep || !isAwaitingDestinations);

  const handleNext = useCallback(() => {
    if (!canProceed) return;

    if (!isLastStep) setStep(steps[stepIndex + 1]);
    else if (isStaffingTab) submitStaffing();
    else submitStatus();
  }, [canProceed, isLastStep, isStaffingTab, stepIndex, steps, submitStaffing, submitStatus]);

  const handleBack = useCallback(() => {
    if (stepIndex > 0) setStep(steps[stepIndex - 1]);
  }, [stepIndex, steps]);

  const title =
    currentStep === 'destination'
      ? t('status.select_destination', { status: selectedStatus?.Text ?? '' })
      : currentStep === 'note'
        ? t('status.add_note')
        : currentStep === 'confirm'
          ? t('status.set_status')
          : isStaffingTab
            ? t('status.select_staffing')
            : subject === 'unit'
              ? t('status.select_unit_status')
              : t('status.select_status');

  const isHoldMode = holdToConfirm && !isStaffingTab;
  // Steps with tabs (status / staffing, calls / stations / POIs) hold the list at its full height, so switching tabs —
  // or the calls arriving — leaves the sheet where it is. The other steps size to what they show.
  const hasTabbedList = currentStep === 'destination' || (currentStep === 'select' && showStaffing);
  const listStyle = useMemo(() => (hasTabbedList ? { height: listMaxHeight } : { maxHeight: listMaxHeight }), [hasTabbedList, listMaxHeight]);

  return (
    <CustomBottomSheet isOpen={isOpen} onClose={handleClose} snapPoints={[SHEET_SNAP_POINT]} testID={testID}>
      <VStack space="md" className="w-full">
        <VStack space="xs">
          <Text className="text-xl font-bold text-typography-900" accessibilityRole="header">
            {title}
          </Text>
          {isOnBehalf && subjectName ? (
            <Text className="text-sm text-typography-500" testID={`${testID}-on-behalf`}>
              {t('status.on_behalf_of', { name: subjectName })}
            </Text>
          ) : null}
        </VStack>

        {showStaffing && currentStep === 'select' ? (
          <HStack space="sm">
            {(['status', 'staffing'] as const).map((value) => (
              <Pressable
                key={value}
                testID={`${testID}-tab-${value}`}
                onPress={() => setTab(value)}
                accessibilityRole="tab"
                accessibilityState={{ selected: tab === value }}
                className={`flex-1 items-center rounded-lg px-3 py-2 ${tab === value ? 'bg-primary-500' : 'bg-background-100'}`}
              >
                <Text className={`font-semibold ${tab === value ? 'text-typography-0' : 'text-typography-700'}`}>{value === 'status' ? t('status.status_tab') : t('status.staffing_tab')}</Text>
              </Pressable>
            ))}
          </HStack>
        ) : null}

        <ScrollView style={listStyle} nestedScrollEnabled keyboardShouldPersistTaps="handled" testID={`${testID}-scroll`}>
          {currentStep === 'select' ? (
            <VStack>
              {isStaffingTab ? (
                staffingOptions.length === 0 ? (
                  <Text className="py-4 text-center text-typography-500">{t('status.no_staffing_available')}</Text>
                ) : (
                  staffingOptions.map((option) => (
                    <StatusOptionRow
                      key={toOptionId(option.Id)}
                      option={option}
                      isSelected={toOptionId(option.Id) === selectedStaffingId}
                      isCurrent={toOptionId(option.Id) === currentStaffingId}
                      isHoldMode={false}
                      onSelect={handleSelectStaffing}
                      testIDPrefix="staffing"
                    />
                  ))
                )
              ) : offered.offered.length === 0 ? (
                <Text className="py-4 text-center text-typography-500">{t('status.no_statuses_available')}</Text>
              ) : (
                offered.offered.map((option) => (
                  <StatusOptionRow
                    key={toOptionId(option.Id)}
                    option={option}
                    isSelected={toOptionId(option.Id) === selectedId}
                    isCurrent={toOptionId(option.Id) === currentStatusId}
                    isHoldMode={isHoldMode}
                    isDisabled={isSubmitting}
                    onSelect={handleSelectStatus}
                    onHold={handleHoldStatus}
                    onHoldTap={() => setIsHoldHintVisible(true)}
                    testIDPrefix="status"
                  />
                ))
              )}
              {!isStaffingTab && offered.isRestricted ? (
                <Button variant="link" onPress={() => setShowAll(true)} testID={`${testID}-show-all`}>
                  <ButtonText>{t('status.show_all_statuses', { count: offered.hiddenCount })}</ButtonText>
                </Button>
              ) : null}
              {!isStaffingTab && hasNextRestriction ? (
                <Button variant="link" onPress={() => setShowAll(false)} testID={`${testID}-show-next`}>
                  <ButtonText>{t('status.show_next_statuses')}</ButtonText>
                </Button>
              ) : null}
            </VStack>
          ) : null}

          {currentStep === 'destination' && selectedStatus ? (
            <StatusDestinationList
              tabs={destinationTabs}
              activeTab={destinationTab}
              onTabChange={setDestinationTab}
              lists={destinations}
              selected={effectiveDestination}
              isLoading={isLoadingDestinations}
              onSelect={handleSelectDestination}
              assignedPoiId={assignedPoi?.PoiId ?? null}
              origin={destinationOrigin}
              unitId={destinationUnitId}
            />
          ) : null}

          {currentStep === 'note' ? (
            <VStack space="sm">
              <Text className="text-sm text-typography-600" testID={reasonRequired ? `${testID}-transport-reason-required` : undefined}>
                {reasonRequired ? t('status.transport_reason_required', { name: assignedPoiLabel }) : noteRequired ? t('status.note_required') : t('status.note_optional')}
              </Text>
              <Textarea size="md" className="min-h-[100px]">
                <TextareaInput testID={`${testID}-note-input`} value={note} onChangeText={setNote} placeholder={t('status.note')} accessibilityLabel={t('status.note')} />
              </Textarea>
            </VStack>
          ) : null}
        </ScrollView>

        {/* A fixed call shows from the first step, so the crew sees which call the status is for before picking one. */}
        {!isStaffingTab && (selectedStatus || fixedCall) && (currentStep !== 'select' || fixedCall) ? (
          <VStack className="rounded-lg bg-background-50 p-3" testID={`${testID}-summary`}>
            {selectedStatus ? <Text className="text-sm text-typography-700">{`${t('status.selected_status')}: ${selectedStatus.Text}`}</Text> : null}
            <Text className="text-sm text-typography-700">{`${t('status.selected_destination')}: ${summaryDestination.type === 'none' ? t('status.no_destination') : destinationLabel(summaryDestination, t('data_protection.protected_value'))}`}</Text>
            {chosenAvailability !== PoiAvailabilityStatuses.Open && effectiveDestination.type === 'poi' ? (
              <Text className="mt-1 text-sm font-semibold text-error-700" testID={`${testID}-destination-availability`}>
                {t('status.destination_availability', { name: destinationLabel(effectiveDestination, t('data_protection.protected_value')), status: t(availabilityLabelKey(chosenAvailability)) })}
              </Text>
            ) : null}
            {isDeviation ? (
              <Text className="mt-1 text-sm font-semibold text-warning-700" testID={`${testID}-transport-deviation`} accessibilityLiveRegion="polite">
                {t('status.transport_destination_differs', { name: assignedPoiLabel })}
              </Text>
            ) : null}
          </VStack>
        ) : null}

        {/* A tap on a hold button (a status on the list, or the save) explains itself here. */}
        {isHoldMode && isHoldHintVisible ? (
          <Text className="text-center text-sm text-typography-600" testID={`${testID}-hold-hint`} accessibilityLiveRegion="polite">
            {t('status.hold_to_set_hint')}
          </Text>
        ) : null}

        {error ? (
          <Text className="rounded-lg bg-error-50 px-3 py-2 text-center text-error-600" testID={`${testID}-error`} accessibilityRole="alert">
            {error}
          </Text>
        ) : null}

        {isHoldMode && currentStep === 'select' ? null : (
          <HStack space="md">
            {isFirstStep ? (
              <Button variant="outline" action="secondary" className="flex-1" onPress={handleClose} isDisabled={isSubmitting} testID={`${testID}-cancel`}>
                <ButtonText>{t('common.cancel')}</ButtonText>
              </Button>
            ) : (
              <Button variant="outline" action="secondary" className="flex-1" onPress={handleBack} isDisabled={isSubmitting} testID={`${testID}-back`}>
                <ButtonText>{t('common.back')}</ButtonText>
              </Button>
            )}
            {isHoldMode && isLastStep ? (
              <HoldToConfirmButton
                testID={`${testID}-hold-submit`}
                onConfirm={handleNext}
                onTap={() => setIsHoldHintVisible(true)}
                disabled={!canProceed}
                backgroundColor={colors.primary}
                foregroundColor={colors.textInverse}
                style={styles.holdSubmit}
                accessibilityLabel={t('status.hold_to_submit')}
                accessibilityHint={t('status.hold_to_set_hint')}
              >
                {isSubmitting ? (
                  <Spinner size="small" color={colors.textInverse} />
                ) : (
                  <Text className="text-center font-semibold" style={{ color: colors.textInverse }}>
                    {t('status.hold_to_submit')}
                  </Text>
                )}
              </HoldToConfirmButton>
            ) : (
              <Button className="flex-1" onPress={handleNext} isDisabled={!canProceed} testID={isLastStep ? `${testID}-submit` : `${testID}-next`}>
                {isSubmitting ? <Spinner size="small" /> : <ButtonText>{isLastStep ? t('status.set_status') : t('common.next')}</ButtonText>}
              </Button>
            )}
          </HStack>
        )}
      </VStack>
    </CustomBottomSheet>
  );
};

const styles = StyleSheet.create({
  holdSubmit: { flex: 1 },
});
