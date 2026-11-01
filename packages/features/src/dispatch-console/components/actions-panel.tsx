import { useSecurity } from '@resgrid/auth';
import { useCapability } from '@resgrid/config';
import { personnelFullName, usePersonnelStore, useUnitsStore } from '@resgrid/data';
import { CheckInSheet, type CheckInTarget, CheckInType } from '@resgrid/features/check-in';
import { CurrentStatusBadge, PersonnelStatusSheet, UnitStatusSheet } from '@resgrid/features/status';
import { useTranslation } from '@resgrid/i18n';
import type { CallResultData } from '@resgrid/models';
import { HStack, Pressable, Text, VStack } from '@resgrid/ui';
import type { LucideIcon } from 'lucide-react-native';
import { AlertTriangle, ClipboardCheck, ExternalLink, Info, Plus, StickyNote, UserPlus, X, Zap } from 'lucide-react-native';
import React, { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { useConsoleStore } from '../hooks/use-console-store';
import { ConsolePersonnelStatusSheet, ConsoleUnitStatusSheet } from './console-status-sheets';

export interface ConsoleActionHandlers {
  onCreateCall?: () => void;
  onViewCall: (callId: string) => void;
  onAddCallNote: (callId: string) => void;
  onCloseCall: (callId: string) => void;
  onAddResources: (call: CallResultData) => void;
  onViewUnit: (unitId: string) => void;
  onViewPersonnel: (userId: string) => void;
  /** A status was saved (sent or queued) for a unit or person on behalf. */
  onStatusSaved?: (kind: 'unit' | 'personnel', names: string) => void;
}

export interface ActionsPanelProps extends ConsoleActionHandlers {
  /** The call the console is filtered to. */
  selectedCall: CallResultData | null;
}

const ActionButton: React.FC<{ icon: LucideIcon; label: string; color: string; onPress: () => void; disabled?: boolean; testID: string }> = ({ icon: Icon, label, color, onPress, disabled = false, testID }) => (
  <Pressable
    onPress={onPress}
    disabled={disabled}
    accessibilityRole="button"
    accessibilityState={{ disabled }}
    className={`mb-2 mr-2 flex-row items-center rounded-lg border border-outline-200 px-3 py-2 ${disabled ? 'opacity-40' : ''}`}
    testID={testID}
  >
    <View>
      <Icon size={14} color={color} />
    </View>
    <Text className="ml-1.5 text-xs font-medium">{label}</Text>
  </Pressable>
);

const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <VStack className="mb-3">
    <Text className="mb-1 text-xs font-semibold uppercase text-typography-500">{title}</Text>
    <HStack className="flex-wrap">{children}</HStack>
  </VStack>
);

type OpenSheet = { kind: 'unit-status'; unitIds: string[]; withCall: boolean } | { kind: 'personnel-status'; userId: string; withCall: boolean } | { kind: 'check-in'; target: CheckInTarget } | null;

/**
 * Context-aware actions (Dispatch baseline actions tab): the selected call's quick actions (details, note, close, add
 * resources), the selected unit's or person's status on behalf (shared status sheets; with the filtered call as the
 * default destination), check-ins on the filtered call, and one status for a multi-unit selection.
 */
export const ActionsPanel: React.FC<ActionsPanelProps> = ({ selectedCall, onCreateCall, onViewCall, onAddCallNote, onCloseCall, onAddResources, onViewUnit, onViewPersonnel, onStatusSaved }) => {
  const { t } = useTranslation();
  const { canUserCreateCalls } = useSecurity();
  const checkIn = useCapability('checkIn');
  const selectedUnitId = useConsoleStore((state) => state.selectedUnitId);
  const selectedPersonnelId = useConsoleStore((state) => state.selectedPersonnelId);
  const selectedUnitIds = useConsoleStore((state) => state.selectedUnitIds);
  const isSelectionMode = useConsoleStore((state) => state.isSelectionMode);
  const unit = useUnitsStore((state) => (selectedUnitId ? state.unitInfos.find((row) => row.UnitId === selectedUnitId) : undefined));
  const person = usePersonnelStore((state) => (selectedPersonnelId ? state.personnel.find((row) => row.UserId === selectedPersonnelId) : undefined));
  const unitInfos = useUnitsStore((state) => state.unitInfos);
  const [sheet, setSheet] = useState<OpenSheet>(null);
  const callId = selectedCall?.CallId ?? null;
  const canCheckIn = checkIn.others && !!selectedCall?.CheckInTimersEnabled;
  const bulkUnits = isSelectionMode ? unitInfos.filter((row) => selectedUnitIds.includes(row.UnitId)) : [];

  const saved = (kind: 'unit' | 'personnel', names: string) => (outcome: string) => {
    if (outcome !== 'rejected') onStatusSaved?.(kind, names);
  };

  return (
    <ScrollView contentContainerStyle={styles.content} testID="console-actions">
      {bulkUnits.length > 0 ? (
        <VStack className="mb-3 rounded-lg border border-primary-200 bg-primary-50 p-3" testID="console-bulk-actions">
          <Text className="font-semibold">{t('dispatch.bulk_unit_actions.selected_count', { count: bulkUnits.length })}</Text>
          <HStack className="mt-1 flex-wrap">
            {bulkUnits.map((row) => (
              <Pressable
                key={row.UnitId}
                onPress={() => useConsoleStore.getState().toggleUnitInSelection(row.UnitId)}
                accessibilityRole="button"
                accessibilityLabel={`${t('dispatch.bulk_unit_actions.remove_unit')} ${row.Name}`}
                className="mb-1 mr-1 flex-row items-center rounded-full bg-background-0 px-2 py-1"
                testID={`console-bulk-unit-${row.UnitId}`}
              >
                <Text className="text-xs">{row.Name}</Text>
                <View className="ml-1">
                  <X size={10} color="#6b7280" />
                </View>
              </Pressable>
            ))}
          </HStack>
          <HStack className="mt-2 flex-wrap">
            <ActionButton
              icon={Zap}
              label={t('dispatch.set_status')}
              color="#3b82f6"
              onPress={() => setSheet({ kind: 'unit-status', unitIds: bulkUnits.map((row) => row.UnitId), withCall: !!callId })}
              testID="console-bulk-set-status"
            />
          </HStack>
        </VStack>
      ) : null}

      {unit ? (
        <VStack className="mb-3 rounded-lg border border-outline-200 p-3" testID="console-unit-actions">
          <HStack className="items-center justify-between">
            <Text className="flex-1 font-semibold" numberOfLines={1}>
              {unit.Name}
            </Text>
            <CurrentStatusBadge text={unit.CurrentStatus} color={unit.CurrentStatusColor} baseType={unit.CurrentStatusBaseType} size="sm" />
          </HStack>
          <HStack className="mt-2 flex-wrap">
            <ActionButton icon={Zap} label={t('dispatch.set_status')} color="#3b82f6" onPress={() => setSheet({ kind: 'unit-status', unitIds: [unit.UnitId], withCall: !!callId })} testID="console-unit-set-status" />
            <ActionButton icon={ExternalLink} label={t('dispatch.view_details')} color="#6b7280" onPress={() => onViewUnit(unit.UnitId)} testID="console-unit-details" />
            {canCheckIn && callId ? (
              <ActionButton
                icon={ClipboardCheck}
                label={t('dispatch_console.check_in')}
                color="#16a34a"
                onPress={() => setSheet({ kind: 'check-in', target: { checkInType: CheckInType.Unit, unitId: Number(unit.UnitId), name: unit.Name } })}
                testID="console-unit-check-in"
              />
            ) : null}
          </HStack>
        </VStack>
      ) : null}

      {person ? (
        <VStack className="mb-3 rounded-lg border border-outline-200 p-3" testID="console-personnel-actions">
          <HStack className="items-center justify-between">
            <Text className="flex-1 font-semibold" numberOfLines={1}>
              {personnelFullName(person) || person.UserId}
            </Text>
            <CurrentStatusBadge text={person.Status} color={person.StatusColor} baseType={person.StatusBaseType} size="sm" />
          </HStack>
          <HStack className="mt-2 flex-wrap">
            <ActionButton
              icon={Zap}
              label={t('dispatch.set_status')}
              color="#8b5cf6"
              onPress={() => setSheet({ kind: 'personnel-status', userId: person.UserId, withCall: !!callId })}
              testID="console-personnel-set-status"
            />
            <ActionButton icon={ExternalLink} label={t('dispatch.view_details')} color="#6b7280" onPress={() => onViewPersonnel(person.UserId)} testID="console-personnel-details" />
            {canCheckIn && callId ? (
              <ActionButton
                icon={ClipboardCheck}
                label={t('dispatch_console.check_in')}
                color="#16a34a"
                onPress={() => setSheet({ kind: 'check-in', target: { checkInType: CheckInType.Personnel, userId: person.UserId, name: personnelFullName(person) } })}
                testID="console-personnel-check-in"
              />
            ) : null}
          </HStack>
        </VStack>
      ) : null}

      <Section title={t('dispatch.call_actions')}>
        {onCreateCall && canUserCreateCalls ? <ActionButton icon={Plus} label={t('dispatch.new_call')} color="#ef4444" onPress={onCreateCall} testID="console-action-new-call" /> : null}
        <ActionButton icon={Info} label={t('dispatch.view_details')} color="#3b82f6" disabled={!callId} onPress={() => (callId ? onViewCall(callId) : undefined)} testID="console-action-view-call" />
        <ActionButton icon={StickyNote} label={t('dispatch.add_note')} color="#8b5cf6" disabled={!callId} onPress={() => (callId ? onAddCallNote(callId) : undefined)} testID="console-action-add-note" />
        {canUserCreateCalls ? (
          <ActionButton
            icon={UserPlus}
            label={t('dispatch_console.add_resources')}
            color="#22c55e"
            disabled={!selectedCall}
            onPress={() => (selectedCall ? onAddResources(selectedCall) : undefined)}
            testID="console-action-add-resources"
          />
        ) : null}
        {canUserCreateCalls ? (
          <ActionButton icon={AlertTriangle} label={t('dispatch.close_call')} color="#f59e0b" disabled={!callId} onPress={() => (callId ? onCloseCall(callId) : undefined)} testID="console-action-close-call" />
        ) : null}
      </Section>

      {!callId && !unit && !person && bulkUnits.length === 0 ? (
        <HStack className="items-center rounded-lg bg-background-warning p-3" testID="console-actions-hint">
          <View>
            <Info size={16} color="#d97706" />
          </View>
          <Text className="ml-2 flex-1 text-xs text-typography-600">{t('dispatch.select_items_for_actions')}</Text>
        </HStack>
      ) : null}

      {sheet?.kind === 'unit-status' && (sheet.withCall || sheet.unitIds.length > 1) ? (
        <ConsoleUnitStatusSheet
          isOpen
          onClose={() => setSheet(null)}
          unitIds={sheet.unitIds}
          defaultCallId={sheet.withCall ? callId : null}
          onSubmitted={saved(
            'unit',
            unitInfos
              .filter((row) => sheet.unitIds.includes(row.UnitId))
              .map((row) => row.Name)
              .join(', ')
          )}
        />
      ) : null}
      {sheet?.kind === 'unit-status' && !sheet.withCall && sheet.unitIds.length === 1 ? <UnitStatusSheet isOpen onClose={() => setSheet(null)} unitId={sheet.unitIds[0]} isOnBehalf /> : null}
      {sheet?.kind === 'personnel-status' && sheet.withCall ? (
        <ConsolePersonnelStatusSheet isOpen onClose={() => setSheet(null)} userId={sheet.userId} defaultCallId={callId} onSubmitted={saved('personnel', person ? personnelFullName(person) : sheet.userId)} />
      ) : null}
      {sheet?.kind === 'personnel-status' && !sheet.withCall ? <PersonnelStatusSheet isOpen onClose={() => setSheet(null)} userId={sheet.userId} /> : null}
      {sheet?.kind === 'check-in' && callId ? <CheckInSheet isOpen onClose={() => setSheet(null)} callId={Number(callId)} ability={{ self: checkIn.self, others: checkIn.others }} target={sheet.target} /> : null}
    </ScrollView>
  );
};

const styles = StyleSheet.create({ content: { padding: 8 } });
