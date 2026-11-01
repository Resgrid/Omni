import { useRecordsStore } from '@resgrid/data';
import { useIsOnline } from '@resgrid/features/calls';
import { useTranslation } from '@resgrid/i18n';
import type { FieldRecordCatalogEntry, RecordDefinitionSchema } from '@resgrid/models';
import { Badge, BadgeText, Button, ButtonText, Divider, Heading, Loading, Pressable, ScreenHeader, Text } from '@resgrid/ui';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ChevronRight, CloudOff } from 'lucide-react-native';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { RecordForm } from '../components/record-form';
import { ContentFrame, Notice } from '../components/records-layout';
import { useRecordsContext } from '../hooks/use-records-context';
import { useDefinitionDisplayName } from '../lib/definition-name';
import { newClientRecordId, stageAndSendDraft } from '../lib/drafts';
import { canAuthorOffline, prefillToValueMap, toValueList, unsupportedFieldKeys, validate, type ValidationIssue, valueListToMap, type ValueMap } from '../lib/record-schema';
import { recordDetail } from '../routes';

export interface RecordNewScreenProps {
  /** Defaults to the `draft` route param: resume a draft staged on this device. */
  draftId?: string;
  showHeader?: boolean;
}

const firstParam = (value: string | string[] | undefined): string | undefined => (Array.isArray(value) ? value[0] : value);

/**
 * Contextual create: pick a definition the server offered for this context, then author it. The catalog is the only
 * source of what may be started here — nothing is inferred locally. The context is the one the Records home or a
 * quick-create button set on the store (else the app's records context).
 */
export default function RecordNewScreen({ draftId: draftProp, showHeader = true }: RecordNewScreenProps) {
  const { t } = useTranslation();
  const router = useRouter();
  const params = useLocalSearchParams<{ draft?: string | string[] }>();
  const draftId = draftProp ?? firstParam(params.draft);
  const isOnline = useIsOnline();
  const fallbackContext = useRecordsContext();
  const storeContext = useRecordsStore((state) => state.context);
  const context = Object.keys(storeContext).length > 0 ? storeContext : fallbackContext;

  const catalog = useRecordsStore((state) => state.catalog);
  const resumed = useRecordsStore((state) => (draftId ? state.pendingDrafts[draftId] : undefined));
  const fetchCatalog = useRecordsStore((state) => state.fetchCatalog);
  const fetchSchema = useRecordsStore((state) => state.fetchSchema);
  const prefill = useRecordsStore((state) => state.prefill);
  const stageDraft = useRecordsStore((state) => state.stageDraft);
  const discardDraft = useRecordsStore((state) => state.discardDraft);

  const [entry, setEntry] = useState<FieldRecordCatalogEntry | null>(null);
  const [schema, setSchema] = useState<RecordDefinitionSchema | null>(null);
  const [values, setValues] = useState<ValueMap>({});
  const [issues, setIssues] = useState<ValidationIssue[]>([]);
  const [isBusy, setIsBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!catalog) void fetchCatalog();
  }, [catalog, fetchCatalog]);

  const choose = useCallback(
    async (chosen: FieldRecordCatalogEntry, existing?: ValueMap) => {
      setIsBusy(true);
      setMessage(null);
      try {
        const loaded = await fetchSchema(chosen.DefinitionKey, chosen.Version);
        setEntry(chosen);
        setSchema(loaded);
        if (existing) {
          setValues(existing);
          return;
        }
        if (!chosen.SupportsPrefill) {
          setValues({});
          return;
        }
        const prefilled = await prefill(chosen.DefinitionKey, chosen.Version);
        setValues(prefillToValueMap(prefilled?.Values ?? []));
      } finally {
        setIsBusy(false);
      }
    },
    [fetchSchema, prefill]
  );

  const resumedMatch = useMemo(
    () => (resumed ? ((catalog?.Definitions ?? []).find((definition) => definition.DefinitionKey === resumed.definitionKey && definition.Version === resumed.definitionVersion) ?? null) : null),
    [resumed, catalog]
  );

  useEffect(() => {
    if (resumed && resumedMatch && !entry) void choose(resumedMatch, valueListToMap(resumed.values));
  }, [resumed, resumedMatch, entry, choose]);

  const unsupported = useMemo(() => unsupportedFieldKeys(schema), [schema]);
  const offlineCapable = canAuthorOffline(entry);
  const blocked = isBusy || unsupported.length > 0;

  const buildDraft = useCallback(() => {
    if (!entry) return null;
    return {
      clientRecordId: resumed?.clientRecordId ?? newClientRecordId(),
      recordId: resumed?.recordId ?? null,
      definitionKey: entry.DefinitionKey,
      definitionVersion: entry.Version,
      name: entry.Name,
      values: toValueList(values),
      callId: context.CallId ?? null,
      stationGroupId: context.GroupId ?? null,
      rowVersion: resumed?.rowVersion ?? null,
      updatedOn: new Date().toISOString(),
      requiresProtectedGrant: entry.RequiresProtectedGrant === true,
    };
  }, [entry, resumed, values, context.CallId, context.GroupId]);

  const checkValues = useCallback((): boolean => {
    const found = validate(schema, values, false);
    setIssues(found);
    if (found.length > 0) setMessage(t('records.fix_fields'));
    return found.length === 0;
  }, [schema, values, t]);

  const saveAndSend = useCallback(async () => {
    if (!checkValues()) return;
    const draft = buildDraft();
    if (!draft) return;
    // A definition that seals values (or is not offline-capable) is authored online only.
    if (!offlineCapable && !isOnline) {
      setMessage(t('records.online_only'));
      return;
    }
    setIsBusy(true);
    try {
      const outcome = await stageAndSendDraft(draft);
      if (outcome.kind === 'sent' && outcome.recordId) {
        router.replace(recordDetail(outcome.recordId));
        return;
      }
      setMessage(outcome.kind === 'sent' ? t('records.saved') : outcome.kind === 'queued' ? t('records.saved_locally') : t('records.save_failed'));
    } finally {
      setIsBusy(false);
    }
  }, [checkValues, buildDraft, offlineCapable, isOnline, router, t]);

  /** Explicit local save (offline-capable definitions only): the Records home sends it at the next opportunity. */
  const keepLocally = useCallback(() => {
    if (!checkValues() || !offlineCapable) return;
    const draft = buildDraft();
    if (!draft) return;
    stageDraft(draft);
    setMessage(t('records.saved_locally'));
  }, [checkValues, offlineCapable, buildDraft, stageDraft, t]);

  const back = () => router.back();
  const header = (title: string) => (showHeader ? <ScreenHeader title={title} onBack={back} testID="record-new-header" /> : null);

  if (!entry) {
    const definitions = catalog?.Definitions ?? [];
    return (
      <View style={styles.screen} className="bg-background-0" testID="record-new-screen">
        {header(t('records.new_record'))}
        <ScrollView>
          <ContentFrame>
            {resumed && catalog && !resumedMatch ? (
              <Notice tone="warning" testID="record-new-retired">
                <Text size="sm" className="text-typography-800">
                  {t('records.conflict_definition_retired')}
                </Text>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-2 self-start"
                  onPress={() => {
                    discardDraft(resumed.clientRecordId);
                    router.back();
                  }}
                  testID="record-new-discard"
                >
                  <ButtonText>{t('records.discard_draft')}</ButtonText>
                </Button>
              </Notice>
            ) : null}
            {isBusy ? <Loading /> : null}
            {!catalog ? (
              <Loading text={t('records.loading')} />
            ) : definitions.length === 0 ? (
              <Text size="sm" className="p-4 text-typography-500" testID="record-new-empty">
                {t('records.nothing_to_create')}
              </Text>
            ) : (
              definitions.map((definition) => <DefinitionChoice key={`${definition.DefinitionKey}:${definition.Version}`} definition={definition} disabled={isBusy} onPress={() => void choose(definition)} />)
            )}
          </ContentFrame>
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={styles.screen} className="bg-background-0" testID="record-new-screen">
      <DefinitionHeader entry={entry} render={header} />
      <ScrollView contentContainerStyle={styles.form} keyboardShouldPersistTaps="handled">
        <ContentFrame>
          {unsupported.length > 0 ? (
            <View className="mb-4 rounded-md border border-warning-300 bg-background-warning p-3" testID="record-new-unsupported">
              <Heading size="xs">{t('records.update_required')}</Heading>
              <Text size="sm" className="mt-1 text-typography-700">
                {t('records.unsupported_definition')}
              </Text>
            </View>
          ) : null}
          {!offlineCapable ? (
            <View style={styles.inline} className="mb-4">
              <View style={styles.inlineIcon}>
                <CloudOff size={14} color="#64748b" />
              </View>
              <Text size="xs" className="text-typography-500">
                {t('records.online_only')}
              </Text>
            </View>
          ) : null}
          {message ? (
            <Text size="sm" className="mb-3 text-typography-700" accessibilityLiveRegion="polite" testID="record-new-message">
              {message}
            </Text>
          ) : null}

          {schema ? <RecordForm schema={schema} values={values} issues={issues} onChange={setValues} readOnly={unsupported.length > 0} /> : <Loading />}

          <View style={styles.actions}>
            <Button isDisabled={blocked || (!offlineCapable && !isOnline)} onPress={() => void saveAndSend()} testID="records-save-send">
              <ButtonText>{t('records.save_and_send')}</ButtonText>
            </Button>
            <Button variant="outline" className="mt-2" isDisabled={blocked || !offlineCapable} onPress={keepLocally} testID="records-save-local">
              <ButtonText>{t('records.save_locally')}</ButtonText>
            </Button>
            <Button variant="link" className="mt-2" onPress={back} testID="records-cancel">
              <ButtonText>{t('records.cancel')}</ButtonText>
            </Button>
          </View>
        </ContentFrame>
      </ScrollView>
    </View>
  );
}

/** The header titled with the department's word for the definition (hooks need a component). */
const DefinitionHeader: React.FC<{ entry: FieldRecordCatalogEntry; render: (title: string) => React.ReactNode }> = ({ entry, render }) => {
  const name = useDefinitionDisplayName(entry.DefinitionKey, entry.Name);
  return <>{render(name)}</>;
};

const DefinitionChoice: React.FC<{ definition: FieldRecordCatalogEntry; disabled: boolean; onPress: () => void }> = ({ definition, disabled, onPress }) => {
  const { t } = useTranslation();
  const name = useDefinitionDisplayName(definition.DefinitionKey, definition.Name);
  return (
    <>
      <Pressable onPress={onPress} disabled={disabled} accessibilityRole="button" accessibilityLabel={name} className="px-4 py-4" testID={`records-choose-${definition.DefinitionKey}`}>
        <View style={styles.inline}>
          <View style={styles.grow}>
            <Text className="font-medium text-typography-900">{name}</Text>
            <View style={styles.badges}>
              {definition.Category ? (
                <Text size="xs" className="mr-2 text-typography-500">
                  {definition.Category}
                </Text>
              ) : null}
              {definition.RequiresProtectedGrant ? (
                <Badge action="warning" size="sm" className="mr-2">
                  <BadgeText>{t('records.online_only_badge')}</BadgeText>
                </Badge>
              ) : null}
              {canAuthorOffline(definition) ? (
                <Badge action="muted" size="sm">
                  <BadgeText>{t('records.offline_capable')}</BadgeText>
                </Badge>
              ) : null}
            </View>
          </View>
          <ChevronRight size={18} color="#94a3b8" />
        </View>
      </Pressable>
      <Divider />
    </>
  );
};

const styles = StyleSheet.create({
  screen: { flex: 1 },
  form: { padding: 16, paddingBottom: 64 },
  inline: { flexDirection: 'row', alignItems: 'center' },
  inlineIcon: { marginRight: 6 },
  grow: { flex: 1 },
  badges: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', marginTop: 4 },
  actions: { marginTop: 16 },
});
