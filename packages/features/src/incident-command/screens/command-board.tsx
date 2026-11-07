import { pushRoutePath } from '@resgrid/core/navigation/route-paths';
import { selectCallById, useCallsStore, useCommandStore } from '@resgrid/data';
import { useTranslation } from '@resgrid/i18n';
import type { ResourceAssignment } from '@resgrid/models';
import { useIncidentCommandRefresh } from '@resgrid/realtime';
import { Button, ButtonText, HStack, ScrollView, TabBar, type TabBarItem, useToast, View, ZeroState } from '@resgrid/ui';
import { router, useFocusEffect } from 'expo-router';
import { ClipboardList } from 'lucide-react-native';
import React, { useCallback, useMemo } from 'react';
import { StyleSheet } from 'react-native';
import { useShallow } from 'zustand/react/shallow';

import { CommandBoardView } from '../components/command-board-view';
import { resolveResourcePosition } from '../hooks/resource-position';
import { useIncidentCommandTier } from '../hooks/use-command-permissions';
import type { IncidentCommandTier } from '../lib/permissions';
import { incidentCommandRoutes } from '../routes';

export interface CommandBoardScreenProps {
  /** Overrides the variant tier (tests). */
  tier?: IncidentCommandTier;
}

/**
 * IC's command tab (`/command`): the active incident's board, with a switcher when the commander runs several. Boards
 * live in the persisted command store (works offline from the last sync); `incidentCommandUpdated` refreshes the
 * pinged board (or resyncs everything for an untracked one) and the active board refreshes on focus.
 */
export default function CommandBoardScreen({ tier: tierOverride }: CommandBoardScreenProps) {
  const { t } = useTranslation();
  const toast = useToast();
  const tier = useIncidentCommandTier(tierOverride);
  const boards = useCommandStore((state) => state.boards);
  const activeCallId = useCommandStore((state) => state.activeCallId);
  const switchCommand = useCommandStore((state) => state.switchCommand);
  const tracked = useMemo(() => Object.values(boards).filter((entry) => !!entry.board || entry.isProvisional), [boards]);
  const active = activeCallId && tracked.some((entry) => entry.callId === activeCallId) ? activeCallId : (tracked[0]?.callId ?? null);
  // One tab per incident this commander runs, named by its call number (the call id until the call has loaded).
  const callNumbers = useCallsStore(useShallow((state) => tracked.map((entry) => selectCallById(state, entry.callId)?.Number)));
  const boardTabs = useMemo<TabBarItem[]>(
    () => tracked.map((entry, index) => ({ key: entry.callId, label: t('incident_command.call_number', { number: callNumbers[index] || entry.callId }), testID: `command-board-tab-${entry.callId}` })),
    [callNumbers, t, tracked]
  );

  useIncidentCommandRefresh(
    {
      refreshBoard: (callId) => useCommandStore.getState().refreshBoard(callId, { bypassCache: true }),
      syncAll: () => useCommandStore.getState().syncFromServer(),
      isTracked: (callId) => !!useCommandStore.getState().boards[callId],
    },
    tier === 'command'
  );

  useFocusEffect(
    useCallback(() => {
      if (!active) return;
      void useCommandStore.getState().refreshBoard(active);
      void useCommandStore.getState().fetchTimeline(active);
    }, [active])
  );

  const showOnMap = useCallback(
    (assignment: ResourceAssignment, name: string) => {
      const position = resolveResourcePosition(assignment);
      if (!position) {
        toast.info(t('incident_command.position_unknown'));
        return;
      }
      router.push(incidentCommandRoutes.resourceMap({ ...position, title: name }));
    },
    [t, toast]
  );

  if (tier !== 'command') {
    return <ZeroState icon={ClipboardList} heading={t('incident_command.not_available')} testID="command-board-screen" />;
  }

  if (!active) {
    return (
      <View className="flex-1 bg-background-50" testID="command-board-screen">
        <ZeroState icon={ClipboardList} heading={t('incident_command.empty_heading')} description={t('incident_command.empty_description')} testID="command-board-empty">
          <HStack className="mt-2" space="sm">
            <Button onPress={() => router.push('/calls' as never)} testID="command-go-to-calls">
              <ButtonText>{t('incident_command.go_to_calls')}</ButtonText>
            </Button>
            <Button variant="outline" onPress={() => router.push(incidentCommandRoutes.incidents())} testID="command-go-to-incidents">
              <ButtonText>{t('incident_command.nav_incidents')}</ButtonText>
            </Button>
          </HStack>
        </ZeroState>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-background-50" testID="command-board-screen">
      {tracked.length > 1 ? <TabBar tabs={boardTabs} activeKey={active} onChange={switchCommand} variant="pills" testID="command-board-switcher" /> : null}
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" testID="command-board-scroll">
        <CommandBoardView
          callId={active}
          tier="command"
          onOpenLog={() => pushRoutePath(router, incidentCommandRoutes.log(active))}
          onOpenMap={() => pushRoutePath(router, incidentCommandRoutes.map(active))}
          onOpenCheckIns={() => router.push(`/call/${encodeURIComponent(active)}` as never)}
          onShowResourceOnMap={showOnMap}
        />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  content: { padding: 12, paddingBottom: 32 },
});
