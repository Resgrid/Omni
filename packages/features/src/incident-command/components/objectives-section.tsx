import { useTranslation } from '@resgrid/i18n';
import { type TacticalObjective, TacticalObjectiveStatus } from '@resgrid/models';
import { Badge, BadgeText, HStack, Pressable, Text, VStack } from '@resgrid/ui';
import { CloudOff, Plus, Target } from 'lucide-react-native';
import React, { useMemo } from 'react';
import { View } from 'react-native';

import { isLocalId } from '../lib/board';
import { objectiveStatusAction, objectiveStatusName, objectiveTypeName } from '../lib/labels';
import { BoardButton } from './board-buttons';
import { PercentBar } from './percent-bar';
import { SectionCard, SectionEmpty } from './section-card';

export interface ObjectivesSectionProps {
  objectives: TacticalObjective[];
  canManage: boolean;
  onAdd: () => void;
  onOpen: (objective: TacticalObjective) => void;
  testID?: string;
}

/** Tactical objectives and benchmarks with progress (IC objectives section); open ones first, by priority then order. */
export const ObjectivesSection: React.FC<ObjectivesSectionProps> = ({ objectives, canManage, onAdd, onOpen, testID = 'command-objectives' }) => {
  const { t } = useTranslation();
  const sorted = useMemo(
    () =>
      [...objectives].sort(
        (a, b) => Number(a.Status === TacticalObjectiveStatus.Complete) - Number(b.Status === TacticalObjectiveStatus.Complete) || (b.Priority ?? 0) - (a.Priority ?? 0) || (a.SortOrder ?? 0) - (b.SortOrder ?? 0)
      ),
    [objectives]
  );
  const done = objectives.filter((objective) => objective.Status === TacticalObjectiveStatus.Complete).length;

  return (
    <SectionCard
      title={t('incident_command.objectives')}
      icon={Target}
      count={objectives.length}
      action={canManage ? <BoardButton label={t('incident_command.add_objective')} icon={Plus} onPress={onAdd} testID={`${testID}-add`} /> : undefined}
      testID={testID}
    >
      {objectives.length > 0 ? <Text className="mb-2 text-xs text-typography-500">{t('incident_command.objectives_done', { done, total: objectives.length })}</Text> : null}
      {sorted.length === 0 ? (
        <SectionEmpty text={t('incident_command.no_objectives')} />
      ) : (
        <VStack space="sm">
          {sorted.map((objective) => {
            const complete = objective.Status === TacticalObjectiveStatus.Complete;
            return (
              <Pressable
                key={objective.TacticalObjectiveId}
                onPress={() => onOpen(objective)}
                accessibilityRole="button"
                accessibilityLabel={objective.Name}
                className="rounded-lg bg-background-50 p-2"
                testID={`${testID}-item-${objective.TacticalObjectiveId}`}
              >
                <HStack className="items-center justify-between" space="sm">
                  <Text className={`min-w-0 flex-1 font-medium ${complete ? 'text-typography-400 line-through' : 'text-typography-900'}`} numberOfLines={2}>
                    {objective.Name}
                  </Text>
                  {isLocalId(objective.TacticalObjectiveId) ? (
                    <View accessibilityLabel={t('incident_command.pending_sync')}>
                      <CloudOff size={14} color="#f59e0b" />
                    </View>
                  ) : null}
                  <Badge action={objectiveStatusAction(objective.Status)} size="sm">
                    <BadgeText>{objectiveStatusName(t, objective.Status)}</BadgeText>
                  </Badge>
                </HStack>
                <Text className="text-xs text-typography-500">{objectiveTypeName(t, objective.ObjectiveType)}</Text>
                <PercentBar percent={complete ? 100 : objective.ProgressPercent} color={complete ? '#22c55e' : '#3b82f6'} />
              </Pressable>
            );
          })}
        </VStack>
      )}
    </SectionCard>
  );
};
