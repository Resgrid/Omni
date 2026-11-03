import { formatUtcInDepartmentTime } from '@resgrid/core/utils/dates';
import { useTranslation } from '@resgrid/i18n';
import type { ChecklistDue, ChecklistHistory, ChecklistTarget } from '@resgrid/models';
import { Badge, BadgeText, Button, ButtonText, HStack, Pressable, Text, useThemeColors, VStack } from '@resgrid/ui';
import { ChevronRight } from 'lucide-react-native';
import React from 'react';
import { StyleSheet, View } from 'react-native';

import { historyOutcomeBadge, occurrenceStateBadge, type StartableChecklist } from '../lib/checklist-filters';

const CARD = 'mb-2 rounded-lg border border-outline-200 bg-background-0 p-3';

export interface DueCheckRowProps {
  row: ChecklistDue;
  disabled?: boolean;
  onOpen: (occurrenceId: string) => void;
}

/** A scheduled check: name, state, what to check and when; the whole card opens it. */
export const DueCheckRow: React.FC<DueCheckRowProps> = React.memo(({ row, disabled = false, onOpen }) => {
  const { t } = useTranslation();
  const colors = useThemeColors();
  const badge = occurrenceStateBadge(row.State);
  const when = formatUtcInDepartmentTime(row.PeriodStartUtc, null);
  return (
    <View testID={`checklist-due-${row.Id}`}>
      <Pressable
        onPress={() => onOpen(row.Id)}
        disabled={disabled || !row.CanStart}
        accessibilityRole="button"
        accessibilityState={{ disabled: disabled || !row.CanStart }}
        accessibilityLabel={[row.Name, badge ? t(badge.labelKey) : '', row.Target.Name, when].filter((part) => !!part).join(', ')}
        className={`${CARD} ${row.CanStart ? '' : 'opacity-70'}`}
        testID={`checklist-open-${row.Id}`}
      >
        <HStack className="items-center" space="sm">
          <VStack className="flex-1" space="xs">
            <HStack className="items-center justify-between" space="sm">
              <Text className="flex-1 font-semibold text-typography-900" numberOfLines={2}>
                {row.Name}
              </Text>
              {badge ? (
                <Badge action={badge.tone} size="sm" testID={`checklist-due-state-${row.Id}`}>
                  <BadgeText>{t(badge.labelKey)}</BadgeText>
                </Badge>
              ) : null}
            </HStack>
            <Text size="sm" className="text-typography-600">{`${row.Target.Name} · ${when}`}</Text>
            {row.WindowEndUtc ? <Text size="xs" className="text-typography-500">{`${t('checklists.labels.WindowEnds')}: ${formatUtcInDepartmentTime(row.WindowEndUtc, null)}`}</Text> : null}
            {row.CanStart ? null : (
              <Text size="xs" className="text-typography-500">
                {t('checklists.labels.AssignmentPermission')}
              </Text>
            )}
          </VStack>
          {row.CanStart ? (
            <View>
              <ChevronRight size={18} color={colors.icon} />
            </View>
          ) : null}
        </HStack>
      </Pressable>
    </View>
  );
});

DueCheckRow.displayName = 'DueCheckRow';

export interface StartableChecklistCardProps {
  item: StartableChecklist;
  onStart: (item: StartableChecklist, target: ChecklistTarget) => void;
}

/** An on-demand checklist with one button per target it can be run for. */
export const StartableChecklistCard: React.FC<StartableChecklistCardProps> = React.memo(({ item, onStart }) => {
  const { t } = useTranslation();
  const { definition, targets } = item;
  return (
    <View className={CARD} testID={`checklist-definition-${definition.Id}`}>
      <Text className="font-semibold text-typography-900">{definition.PublishedForm.Name}</Text>
      {definition.PublishedForm.Instructions ? (
        <Text size="sm" className="mt-0.5 text-typography-600" numberOfLines={2}>
          {definition.PublishedForm.Instructions}
        </Text>
      ) : null}
      <Text size="xs" className="mt-2 text-typography-500">
        {t('checklists.labels.SelectTarget')}
      </Text>
      <View style={styles.wrap}>
        {targets.map((target) => (
          <Button key={`${target.Type}:${target.Id}`} variant="outline" size="sm" className="mr-2 mt-2" onPress={() => onStart(item, target)} testID={`checklist-start-${definition.Id}-${target.Id}`}>
            <ButtonText>{target.Name}</ButtonText>
          </Button>
        ))}
      </View>
    </View>
  );
});

StartableChecklistCard.displayName = 'StartableChecklistCard';

export interface ChecklistHistoryRowProps {
  row: ChecklistHistory;
  /** The checklist's name when the due page carries it (history rows only have the definition id). */
  name?: string;
  onOpen: (runId: string) => void;
}

/** A past or unfinished run: checklist, target, when, outcome and score; the card opens the run. */
export const ChecklistHistoryRow: React.FC<ChecklistHistoryRowProps> = React.memo(({ row, name, onOpen }) => {
  const { t } = useTranslation();
  const colors = useThemeColors();
  const badge = historyOutcomeBadge(row);
  const when = formatUtcInDepartmentTime(row.SubmittedOn ?? row.UpdatedOn, null);
  const details = [name ? row.TargetName : '', when, row.Score != null ? `${t('checklists.labels.Score')}: ${row.Score}` : ''].filter((part) => !!part).join(' · ');
  return (
    <Pressable onPress={() => onOpen(row.Id)} accessibilityRole="button" accessibilityLabel={[name ?? row.TargetName, t(badge.labelKey), details].join(', ')} className={CARD} testID={`checklist-history-${row.Id}`}>
      <HStack className="items-center" space="sm">
        <VStack className="flex-1" space="xs">
          <HStack className="items-center justify-between" space="sm">
            <Text className="flex-1 font-semibold text-typography-900" numberOfLines={2}>
              {name ?? row.TargetName}
            </Text>
            <Badge action={badge.tone} size="sm" testID={`checklist-history-outcome-${row.Id}`}>
              <BadgeText>{t(badge.labelKey)}</BadgeText>
            </Badge>
          </HStack>
          <Text size="sm" className="text-typography-600">
            {details}
          </Text>
        </VStack>
        <View>
          <ChevronRight size={18} color={colors.icon} />
        </View>
      </HStack>
    </Pressable>
  );
});

ChecklistHistoryRow.displayName = 'ChecklistHistoryRow';

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', flexWrap: 'wrap' },
});
