import { toDataError, useRecordsStore } from '@resgrid/data';
import type { RecordData, RecordDefinitionSchema } from '@resgrid/models';
import { useCallback, useEffect, useRef, useState } from 'react';

import { fetchRecord } from '../lib/records-api';

export interface RecordState {
  record: RecordData | null;
  schema: RecordDefinitionSchema | null;
  isLoading: boolean;
  /** Translation key of the last load failure (`errors.data.<code>`), or null. */
  errorKey: string | null;
  /** Re-reads the record as the server holds it now (replacing local edits); resolves to the fresh copy. */
  reload: () => Promise<RecordData | null>;
}

/**
 * One record and its definition schema, read fresh from the server (row version and withheld cells are the server's
 * answer at that moment). An answer for a previous id is dropped.
 */
export function useRecord(id: string | null): RecordState {
  const fetchSchema = useRecordsStore((state) => state.fetchSchema);
  const [record, setRecord] = useState<RecordData | null>(null);
  const [schema, setSchema] = useState<RecordDefinitionSchema | null>(null);
  const [isLoading, setIsLoading] = useState(id !== null);
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const current = useRef(id);
  current.current = id;

  const reload = useCallback(async (): Promise<RecordData | null> => {
    if (!id) return null;
    setIsLoading(true);
    setErrorKey(null);
    try {
      const loaded = await fetchRecord(id);
      if (current.current !== id) return null;
      setRecord(loaded);
      if (loaded?.DefinitionKey) {
        const loadedSchema = await fetchSchema(loaded.DefinitionKey, loaded.DefinitionVersion);
        if (current.current === id) setSchema(loadedSchema);
      }
      return loaded;
    } catch (error) {
      if (current.current === id) setErrorKey(toDataError(error).messageKey);
      return null;
    } finally {
      if (current.current === id) setIsLoading(false);
    }
  }, [id, fetchSchema]);

  useEffect(() => {
    setRecord(null);
    setSchema(null);
    void reload();
  }, [reload]);

  return { record, schema, isLoading, errorKey, reload };
}
