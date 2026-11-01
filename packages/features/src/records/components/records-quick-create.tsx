import { useRecordsStore } from '@resgrid/data';
import { useTranslation } from '@resgrid/i18n';
import type { FieldRecordContextInput } from '@resgrid/models';
import { Button, ButtonText } from '@resgrid/ui';
import { useRouter } from 'expo-router';
import { FilePlus2 } from 'lucide-react-native';
import React, { useEffect } from 'react';

import { useRecordsFieldStatus } from '../hooks/use-records-field-status';
import { recordNew } from '../routes';

// Contextual create (RMS plan RMS-1D): start a record from what the person is already looking at. The button appears
// only when the server offered something for this context, so a dead end is impossible; the context is verified
// server-side on every request.

export interface RecordsQuickCreateProps {
  context: FieldRecordContextInput;
  size?: 'xs' | 'sm' | 'md' | 'lg';
  variant?: 'solid' | 'outline' | 'link';
  testID?: string;
}

const sameContext = (a: FieldRecordContextInput, b: FieldRecordContextInput): boolean =>
  (a.CallId ?? null) === (b.CallId ?? null) &&
  (a.UnitId ?? null) === (b.UnitId ?? null) &&
  (a.GroupId ?? null) === (b.GroupId ?? null) &&
  (a.CommandRole ?? null) === (b.CommandRole ?? null) &&
  (a.ContactId ?? null) === (b.ContactId ?? null);

export const RecordsQuickCreate: React.FC<RecordsQuickCreateProps> = ({ context, size = 'sm', variant = 'outline', testID = 'records-quick-create' }) => {
  const { t } = useTranslation();
  const router = useRouter();
  const flagStatus = useRecordsFieldStatus();
  const storeContext = useRecordsStore((state) => state.context);
  const setContext = useRecordsStore((state) => state.setContext);
  const fetchCatalog = useRecordsStore((state) => state.fetchCatalog);
  const count = useRecordsStore((state) => (sameContext(state.context, context) ? (state.catalog?.Definitions.length ?? 0) : 0));
  const { CallId, UnitId, GroupId, CommandRole, ContactId } = context;

  useEffect(() => {
    if (flagStatus !== 'enabled') return;
    const next: FieldRecordContextInput = { CallId, UnitId, GroupId, CommandRole, ContactId };
    if (!sameContext(useRecordsStore.getState().context, next)) setContext(next);
    void fetchCatalog();
  }, [flagStatus, CallId, UnitId, GroupId, CommandRole, ContactId, setContext, fetchCatalog]);

  if (flagStatus !== 'enabled' || count === 0 || !sameContext(storeContext, context)) return null;

  return (
    <Button action="secondary" size={size} variant={variant} onPress={() => router.push(recordNew())} accessibilityLabel={t('records.new_record')} testID={testID}>
      <FilePlus2 size={16} color="#2563eb" />
      <ButtonText>{t('records.new_record')}</ButtonText>
    </Button>
  );
};
