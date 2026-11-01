import { useTerm } from '@resgrid/auth';
import { isSafeRouteId } from '@resgrid/core/utils/route-ids';
import { useRecordsStore } from '@resgrid/data';
import { useIsOnline } from '@resgrid/features/calls';
import { ProtectedRevealBar } from '@resgrid/features/data-protection';
import { useTranslation } from '@resgrid/i18n';
import { type RecordData, RmsRecordState } from '@resgrid/models';
import { Badge, BadgeText, Button, ButtonText, Heading, Loading, ScreenHeader, Text, ZeroState } from '@resgrid/ui';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { FileText } from 'lucide-react-native';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { RecordAttachments } from '../components/record-attachments';
import { RecordForm } from '../components/record-form';
import { recordStateName } from '../components/record-list-item';
import { CheckRow, ContentFrame } from '../components/records-layout';
import { useRecord } from '../hooks/use-record';
import { useDefinitionDisplayName } from '../lib/definition-name';
import { stageAndSendDraft } from '../lib/drafts';
import { toValueList, toValueMap, unsupportedFieldKeys, validate, type ValidationIssue, type ValueMap, withheldCellKeys } from '../lib/record-schema';
import { type LegalCommandOutcome, runLegalCommand } from '../runtime';

export interface RecordDetailScreenProps {
  /** Defaults to the `id` route param. */
  recordId?: string;
  showHeader?: boolean;
}

const firstParam = (value: string | string[] | undefined): string | undefined => (Array.isArray(value) ? value[0] : value);

/**
 * One record (IC baseline): edit while it is a draft or returned, then submit for review or finalize online. Amend,
 * void and approval stay web-first (RMS plan RMS-1D). Withheld (protected/restricted) cells render as protected and
 * are never posted back; the reveal bar re-reads the record with a grant.
 */
export default function RecordDetailScreen({ recordId: idProp, showHeader = true }: RecordDetailScreenProps) {
  const { t } = useTranslation();
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const routeId = firstParam(params.id);
  const id = idProp ?? (routeId && isSafeRouteId(routeId) ? routeId : null);
  const recordsTitle = useTerm('module.records', t('records.title'));

  if (!id) return <ZeroState icon={FileText} isError heading={t('records.not_found')} testID="record-detail-invalid" />;
  return <RecordDetail id={id} showHeader={showHeader} recordsTitle={recordsTitle} />;
}

function RecordDetail({ id, showHeader, recordsTitle }: { id: string; showHeader: boolean; recordsTitle: string }) {
  const { t } = useTranslation();
  const router = useRouter();
  const isOnline = useIsOnline();
  const { record, schema, isLoading, errorKey, reload } = useRecord(id);
  const submitForReview = useRecordsStore((state) => state.submitForReview);
  const finalize = useRecordsStore((state) => state.finalize);
  const entry = useRecordsStore((state) => (record?.DefinitionKey ? state.entryFor(record.DefinitionKey, record.DefinitionVersion) : null));
  const typeName = useDefinitionDisplayName(record?.DefinitionKey, entry?.Name);

  const [values, setValues] = useState<ValueMap>({});
  const [issues, setIssues] = useState<ValidationIssue[]>([]);
  const [attested, setAttested] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  // Edits made since the record was last loaded; they exist only here until saved.
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    setValues(toValueMap(record?.Values?.Cells));
    setDirty(false);
  }, [record]);

  const withheld = useMemo(() => withheldCellKeys(record?.Values?.Cells), [record]);
  const unsupported = useMemo(() => unsupportedFieldKeys(schema), [schema]);
  const editable = record ? record.State === RmsRecordState.Draft || record.State === RmsRecordState.Returned : false;
  const canAct = editable && unsupported.length === 0;

  // The reveal bar re-reads after a reveal or conceal so withheld cells follow the grant.
  const refresh = useCallback(async (): Promise<void> => {
    await reload();
  }, [reload]);

  const handleChange = useCallback((next: ValueMap) => {
    setValues(next);
    setDirty(true);
  }, []);

  const check = useCallback(
    (forFinalize: boolean): boolean => {
      const found = validate(schema, values, forFinalize, withheld);
      setIssues(found);
      if (found.length > 0) setMessage(t('records.fix_fields'));
      return found.length === 0;
    },
    [schema, values, withheld, t]
  );

  /** Sends the edited values; resolves to the record as the server now holds it, or null when it was not saved. */
  const persist = useCallback(
    async (current: RecordData): Promise<RecordData | null> => {
      const outcome = await stageAndSendDraft({
        // Deterministic per row version: the same edit of the same version replays once and never twice.
        clientRecordId: `edit-${current.RecordId}-${current.RowVersion}`,
        recordId: current.RecordId,
        definitionKey: current.DefinitionKey ?? '',
        definitionVersion: current.DefinitionVersion,
        name: current.RecordNumber ?? current.DraftReference ?? (typeName || t('records.untitled')),
        values: toValueList(values, withheld),
        callId: current.CallId ?? null,
        stationGroupId: current.StationGroupId ?? null,
        rowVersion: current.RowVersion,
        updatedOn: new Date().toISOString(),
      });
      if (outcome.kind === 'sent') return reload();
      if (outcome.kind === 'queued') {
        setMessage(t('records.saved_locally'));
        return null;
      }
      // A conflict is shown, never resolved by overwriting: the person reloads and decides.
      const refused = useRecordsStore.getState().pendingDrafts[`edit-${current.RecordId}-${current.RowVersion}`];
      setMessage(refused?.conflict ? t(`records.conflict_${refused.conflict.replace('-', '_')}`) : t('records.save_failed'));
      return null;
    },
    [values, withheld, typeName, reload, t]
  );

  const commandMessage = useCallback(
    (outcome: LegalCommandOutcome, sentKey: string): string => (outcome === 'sent' ? t(sentKey) : outcome === 'awaiting_confirmation' ? t('records.command_waiting') : t('records.save_failed')),
    [t]
  );

  const save = useCallback(async () => {
    if (!record || !check(false)) return;
    setIsBusy(true);
    try {
      if (await persist(record)) setMessage(t('records.saved'));
    } finally {
      setIsBusy(false);
    }
  }, [record, check, persist, t]);

  const submit = useCallback(async () => {
    if (!record) return;
    if (dirty && !check(false)) return;
    setIsBusy(true);
    try {
      // Unsaved edits go first; otherwise the server's older copy is what would be put up for review.
      const current = dirty ? await persist(record) : record;
      if (!current) return;
      const outcome = await runLegalCommand(() => submitForReview(current.RecordId, current.RowVersion), isOnline);
      setMessage(commandMessage(outcome, 'records.submitted'));
      if (outcome === 'sent') await reload();
    } finally {
      setIsBusy(false);
    }
  }, [record, dirty, check, persist, submitForReview, isOnline, reload, commandMessage]);

  const complete = useCallback(async () => {
    if (!record || !check(true)) return;
    setIsBusy(true);
    try {
      // The values just validated are the ones finalized, so unsaved edits are sent first.
      const current = dirty ? await persist(record) : record;
      if (!current) return;
      const outcome = await runLegalCommand(() => finalize(current.RecordId, current.RowVersion, attested), isOnline);
      setMessage(commandMessage(outcome, 'records.finalized'));
      if (outcome === 'sent') await reload();
    } finally {
      setIsBusy(false);
    }
  }, [record, dirty, check, persist, finalize, attested, isOnline, reload, commandMessage]);

  const header = (title: string) => (showHeader ? <ScreenHeader title={title} onBack={() => router.back()} testID="record-detail-header" /> : null);

  if (!record) {
    return (
      <View style={styles.screen} className="bg-background-0" testID="record-detail-screen">
        {header(recordsTitle)}
        {isLoading ? <Loading /> : <ZeroState icon={FileText} isError={errorKey !== null} heading={errorKey ? t('records.load_failed') : t('records.not_found')} testID="record-detail-missing" />}
      </View>
    );
  }

  const state = recordStateName(record);

  return (
    <View style={styles.screen} className="bg-background-0" testID="record-detail-screen">
      {header(record.RecordNumber ?? record.DraftReference ?? recordsTitle)}
      <ProtectedRevealBar onRefresh={refresh} testID="record-protected-bar" />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <ContentFrame>
          <View style={styles.summary}>
            <Heading size="sm">{typeName || recordsTitle}</Heading>
            {state ? (
              <Badge action="muted" size="sm" className="mt-1 self-start">
                <BadgeText testID="record-detail-state">{state}</BadgeText>
              </Badge>
            ) : null}
          </View>

          {unsupported.length > 0 ? (
            <View className="mb-4 rounded-md border border-warning-300 bg-background-warning p-3" testID="record-detail-unsupported">
              <Heading size="xs">{t('records.update_required')}</Heading>
              <Text size="sm" className="mt-1 text-typography-700">
                {t('records.unsupported_definition')}
              </Text>
            </View>
          ) : null}

          {message ? (
            <Text size="sm" className="mb-3 text-typography-700" accessibilityLiveRegion="polite" testID="record-detail-message">
              {message}
            </Text>
          ) : null}

          {schema ? <RecordForm schema={schema} values={values} issues={issues} withheld={withheld} readOnly={!canAct} onChange={handleChange} /> : <Loading />}

          <RecordAttachments recordId={record.RecordId} allowAttachments={entry?.AllowAttachments !== false} readOnly={!editable} />

          {canAct ? (
            <View style={styles.actions}>
              <Button isDisabled={isBusy} onPress={() => void save()} testID="record-save">
                <ButtonText>{t('records.save')}</ButtonText>
              </Button>
              <Button variant="outline" className="mt-2" isDisabled={isBusy} onPress={() => void submit()} testID="record-submit">
                <ButtonText>{t('records.submit_for_review')}</ButtonText>
              </Button>
              <CheckRow label={t('records.attestation')} checked={attested} onChange={setAttested} testID="record-attest" />
              <Button variant="outline" isDisabled={isBusy || !attested} onPress={() => void complete()} testID="record-finalize">
                <ButtonText>{t('records.finalize')}</ButtonText>
              </Button>
            </View>
          ) : null}
        </ContentFrame>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { padding: 16, paddingBottom: 64 },
  summary: { marginBottom: 16 },
  actions: { marginTop: 16 },
});
