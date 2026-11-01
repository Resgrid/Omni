import { useSecurity } from '@resgrid/auth';
import type { Capabilities } from '@resgrid/config';
import { useCommandStore } from '@resgrid/data';
import { useTranslation } from '@resgrid/i18n';
import { IncidentCommandStatus } from '@resgrid/models';
import { useRealtimeRefetch } from '@resgrid/realtime';
import { Button, ButtonText, Loading, Text, useToast } from '@resgrid/ui';
import { router } from 'expo-router';
import { Expand, Network } from 'lucide-react-native';
import React, { useCallback, useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { useCommandPermissions, useIncidentCommandTier } from '../hooks/use-command-permissions';
import type { IncidentCommandTier } from '../lib/permissions';
import { incidentCommandRoutes } from '../routes';
import { BoardButton } from './board-buttons';
import { CommandBoardView } from './command-board-view';
import { ResourceIncidentPanel } from './resource-incident-panel';
import { StartCommandSheet } from './sheets/lifecycle-sheets';

export interface IncidentCommandTabProps {
  callId: string;
  /** Overrides the variant tier (tests). */
  tier?: IncidentCommandTier;
  /** The Unit app passes its active unit (view tier). */
  unitId?: number | string | null;
  /** Already full screen (`/call/[id]/command`): no "open full board" action. */
  fullScreen?: boolean;
}

const NoCommand: React.FC<{ canEstablish: boolean; onEstablish: () => void; extra?: React.ReactNode }> = ({ canEstablish, onEstablish, extra }) => {
  const { t } = useTranslation();
  return (
    <View style={styles.empty} testID="incident-command-tab-empty">
      <View>
        <Network size={36} color="#9ca3af" />
      </View>
      <Text className="mt-2 text-center font-medium text-typography-900">{t('incident_command.no_command')}</Text>
      <Text className="mt-1 text-center text-sm text-typography-500">{t('incident_command.no_command_description')}</Text>
      {extra ?? null}
      {canEstablish ? (
        <Button className="mt-3" onPress={onEstablish} accessibilityLabel={t('incident_command.establish_command')} testID="incident-command-tab-establish">
          <ButtonText>{t('incident_command.establish_command')}</ButtonText>
        </Button>
      ) : null}
    </View>
  );
};

/** Dispatch (assist): the call's board read straight from the server, kept fresh by `incidentCommandUpdated`. */
const AssistTab: React.FC<{ callId: string; fullScreen: boolean }> = ({ callId, fullScreen }) => {
  const { t } = useTranslation();
  const toast = useToast();
  const { rights } = useSecurity();
  // Working a board is its own permission (rights `CanLoginToCommandApp`); without it every board endpoint is a 403.
  const canWorkCommand = rights?.CanLoginToCommandApp !== false;
  const entry = useCommandStore((state) => state.boards[callId]);
  const isLoading = useCommandStore((state) => state.loading.board === true);
  const refreshBoard = useCommandStore((state) => state.refreshBoard);
  const fetchTimeline = useCommandStore((state) => state.fetchTimeline);
  const startCommand = useCommandStore((state) => state.startCommand);
  const permissions = useCommandPermissions(callId, { tier: 'assist' });
  const [isStartOpen, setIsStartOpen] = useState(false);

  const load = useCallback(async () => {
    await refreshBoard(callId, { bypassCache: true });
    await fetchTimeline(callId);
  }, [callId, fetchTimeline, refreshBoard]);

  useEffect(() => {
    if (canWorkCommand) void load();
  }, [canWorkCommand, load]);

  useRealtimeRefetch(['incidentCommandUpdated', 'eventingHubJoined'], load, canWorkCommand);

  if (!canWorkCommand) {
    return (
      <View style={styles.empty} testID="incident-command-tab-not-authorized">
        <Text className="text-center font-medium text-typography-900">{t('incident_command.not_authorized')}</Text>
        <Text className="mt-1 text-center text-sm text-typography-500">{t('incident_command.not_authorized_description')}</Text>
      </View>
    );
  }

  const hasCommand = !!entry?.board?.Command?.IncidentCommandId || !!entry?.isProvisional;

  if (!hasCommand) {
    return isLoading && !entry ? (
      <View style={styles.empty}>
        <Loading text="" />
      </View>
    ) : (
      <>
        <NoCommand canEstablish={permissions.canEstablish} onEstablish={() => setIsStartOpen(true)} />
        <StartCommandSheet
          isOpen={isStartOpen}
          onClose={() => setIsStartOpen(false)}
          onStart={(definitionId) =>
            void startCommand(callId, definitionId).then(
              (result) => {
                if (result?.outcome === 'rejected') toast.error(t('incident_command.establish_failed'));
              },
              () => toast.error(t('incident_command.write_failed'))
            )
          }
        />
      </>
    );
  }

  return (
    <View style={styles.board}>
      <CommandBoardView
        callId={callId}
        tier="assist"
        headerActions={
          fullScreen ? undefined : (
            <BoardButton label={t('incident_command.open_full_board')} icon={Expand} onPress={() => router.push(incidentCommandRoutes.callBoard(callId) as never)} testID="incident-command-tab-open-full" />
          )
        }
      />
    </View>
  );
};

/** IC (command): the board when this device tracks the incident; otherwise track an existing command or establish one. */
const CommandTab: React.FC<{ callId: string }> = ({ callId }) => {
  const { t } = useTranslation();
  const toast = useToast();
  const entry = useCommandStore((state) => state.boards[callId]);
  const summary = useCommandStore((state) => state.summaries.find((candidate) => String(candidate.CallId) === callId && candidate.Status === IncidentCommandStatus.Active));
  const fetchIncidents = useCommandStore((state) => state.fetchIncidents);
  const [isStartOpen, setIsStartOpen] = useState(false);
  const tracked = !!entry && (!!entry.board || entry.isProvisional);

  useEffect(() => {
    if (!tracked) void fetchIncidents();
  }, [fetchIncidents, tracked]);

  const openBoard = useCallback(() => {
    useCommandStore.getState().switchCommand(callId);
    router.push(incidentCommandRoutes.board() as never);
  }, [callId]);

  const track = useCallback(async () => {
    await useCommandStore.getState().refreshBoard(callId, { bypassCache: true });
    if (useCommandStore.getState().boards[callId]?.board) openBoard();
    else toast.error(t('incident_command.track_failed'));
  }, [callId, openBoard, t, toast]);

  if (!tracked) {
    return (
      <>
        <NoCommand
          canEstablish={!summary}
          onEstablish={() => setIsStartOpen(true)}
          extra={
            summary ? (
              <Button className="mt-3" onPress={() => void track()} testID="incident-command-tab-track">
                <ButtonText>{t('incident_command.open_existing_command')}</ButtonText>
              </Button>
            ) : null
          }
        />
        <StartCommandSheet
          isOpen={isStartOpen}
          onClose={() => setIsStartOpen(false)}
          onStart={(definitionId) =>
            void useCommandStore
              .getState()
              .startCommand(callId, definitionId)
              .then(
                () => router.push(incidentCommandRoutes.board() as never),
                () => toast.error(t('incident_command.write_failed'))
              )
          }
        />
      </>
    );
  }

  return (
    <View style={styles.board}>
      <CommandBoardView
        callId={callId}
        tier="command"
        onOpenLog={() => router.push(incidentCommandRoutes.log(callId) as never)}
        onOpenMap={() => router.push(incidentCommandRoutes.map(callId) as never)}
        headerActions={<BoardButton label={t('incident_command.open_command_board')} icon={Expand} onPress={openBoard} testID="incident-command-tab-open-board" />}
      />
    </View>
  );
};

/**
 * The call detail "Incident command" tab (plan §7.10 tab registry), one component for every tier: `view` (Responder,
 * Unit) shows the resource's own slice, `assist` (Dispatch) the board with the member's server capabilities, `command`
 * (IC) the full board. `none` (BigBoard) renders nothing.
 */
export const IncidentCommandTab: React.FC<IncidentCommandTabProps> = ({ callId, tier: tierOverride, unitId, fullScreen = false }) => {
  const tier = useIncidentCommandTier(tierOverride);
  if (tier === 'none') return null;
  if (tier === 'view') return <ResourceIncidentPanel callId={callId} unitId={unitId} />;
  if (tier === 'assist') return <AssistTab callId={callId} fullScreen={fullScreen} />;
  return <CommandTab callId={callId} />;
};

/** Id and order of the tab in the calls registry (between Check-in 60 and Video 70). */
export const INCIDENT_COMMAND_CALL_TAB_ID = 'incident-command';
export const INCIDENT_COMMAND_CALL_TAB_ORDER = 65;

/**
 * The calls tab-registry definition (structurally a `CallDetailTabDefinition`; typed locally so this feature never
 * imports the calls feature, which may register it). Register from the app layer:
 * `registerCallDetailTab(createIncidentCommandCallTab())`.
 */
export interface IncidentCommandCallTabDefinition {
  id: string;
  order: number;
  title: string;
  visible: (context: { capabilities: Pick<Capabilities, 'incidentCommand'> }) => boolean;
  render: (context: { callId: string }) => React.ReactNode;
}

export function createIncidentCommandCallTab(): IncidentCommandCallTabDefinition {
  return {
    id: INCIDENT_COMMAND_CALL_TAB_ID,
    order: INCIDENT_COMMAND_CALL_TAB_ORDER,
    title: 'incident_command.tab_title',
    visible: (context) => context.capabilities.incidentCommand !== 'none',
    render: (context) => <IncidentCommandTab callId={context.callId} />,
  };
}

const styles = StyleSheet.create({
  empty: { padding: 24, alignItems: 'center' },
  board: { padding: 8 },
});
