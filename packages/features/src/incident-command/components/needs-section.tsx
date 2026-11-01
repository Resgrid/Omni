import { useTranslation } from '@resgrid/i18n';
import { type IncidentNeed, IncidentNeedStatus } from '@resgrid/models';
import { Badge, BadgeText, HStack, Pressable, Text, VStack } from '@resgrid/ui';
import { CloudOff, PackageSearch, Plus } from 'lucide-react-native';
import React, { useMemo } from 'react';
import { View } from 'react-native';

import { isLocalId } from '../lib/board';
import { needCategoryName, needStatusAction, needStatusName } from '../lib/labels';
import { BoardButton } from './board-buttons';
import { PercentBar } from './percent-bar';
import { SectionCard, SectionEmpty } from './section-card';

export interface NeedsSectionProps {
  needs: IncidentNeed[];
  canManage: boolean;
  onAdd: () => void;
  /** Opens the fulfilment sheet; omitted = read-only rows. */
  onOpen?: (need: IncidentNeed) => void;
  testID?: string;
}

const isSettled = (status: number) => status === IncidentNeedStatus.Met || status === IncidentNeedStatus.Cancelled;

/** Command-level needs tracked to fulfilment (IC needs section): open ones first, by priority. */
export const NeedsSection: React.FC<NeedsSectionProps> = ({ needs, canManage, onAdd, onOpen, testID = 'command-needs' }) => {
  const { t } = useTranslation();
  const sorted = useMemo(() => [...needs].sort((a, b) => Number(isSettled(a.Status)) - Number(isSettled(b.Status)) || (b.Priority ?? 0) - (a.Priority ?? 0) || (a.SortOrder ?? 0) - (b.SortOrder ?? 0)), [needs]);
  const open = needs.filter((need) => !isSettled(need.Status)).length;

  return (
    <SectionCard
      title={t('incident_command.needs')}
      icon={PackageSearch}
      count={open}
      action={canManage ? <BoardButton label={t('incident_command.add_need')} icon={Plus} onPress={onAdd} testID={`${testID}-add`} /> : undefined}
      testID={testID}
    >
      {sorted.length === 0 ? (
        <SectionEmpty text={t('incident_command.no_needs')} />
      ) : (
        <VStack space="sm">
          {sorted.map((need) => {
            const body = (
              <>
                <HStack className="items-center justify-between" space="sm">
                  <Text className={`min-w-0 flex-1 font-medium ${isSettled(need.Status) ? 'text-typography-500' : 'text-typography-900'}`} numberOfLines={2}>
                    {need.Name}
                  </Text>
                  {isLocalId(need.IncidentNeedId) ? (
                    <View accessibilityLabel={t('incident_command.pending_sync')}>
                      <CloudOff size={14} color="#f59e0b" />
                    </View>
                  ) : null}
                  <Badge action={needStatusAction(need.Status)} size="sm">
                    <BadgeText>{needStatusName(t, need.Status)}</BadgeText>
                  </Badge>
                </HStack>
                <Text className="text-xs text-typography-500">{needCategoryName(t, need.Category)}</Text>
                {need.QuantityRequested > 0 ? (
                  <>
                    <Text className="text-xs text-typography-700">{t('incident_command.need_quantity_progress', { fulfilled: need.QuantityFulfilled ?? 0, requested: need.QuantityRequested })}</Text>
                    <PercentBar percent={((need.QuantityFulfilled ?? 0) / need.QuantityRequested) * 100} color="#f59e0b" />
                  </>
                ) : null}
              </>
            );
            return onOpen && canManage ? (
              <Pressable
                key={need.IncidentNeedId}
                onPress={() => onOpen(need)}
                accessibilityRole="button"
                accessibilityLabel={need.Name}
                className="rounded-lg bg-background-50 p-2"
                testID={`${testID}-item-${need.IncidentNeedId}`}
              >
                {body}
              </Pressable>
            ) : (
              <View key={need.IncidentNeedId} className="rounded-lg bg-background-50 p-2" testID={`${testID}-item-${need.IncidentNeedId}`}>
                {body}
              </View>
            );
          })}
        </VStack>
      )}
    </SectionCard>
  );
};
