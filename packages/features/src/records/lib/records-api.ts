import { getRecord, getRecordAttachments, getRecordDeploymentReconciliation, removeRecordAttachment } from '@resgrid/api';
import { assertV4Success, getDataApiContext, hasDataApiContext, unwrapItem, unwrapList } from '@resgrid/data';
import type { RecordAttachmentData, RecordData, RecordDeploymentReconciliationData } from '@resgrid/models';

/*
 * Reads (and one attachment command) the records screens need that @resgrid/data does not hold yet. A record is
 * read fresh every time (it can carry restricted values and the server's row version decides every save), so it is
 * deliberately not cached on the device.
 * TODO(data): move `getRecord`, attachments (list/remove + the resumable BeginUpload/UploadChunk/CompleteUpload
 * session) and the department-wide reconciliation read into `useRecordsStore` / `useRecordDeploymentsStore`.
 */

/** The record as the server holds it now; null when it does not exist or the caller may not read it (`not_found` is HTTP 200). */
export async function fetchRecord(id: string): Promise<RecordData | null> {
  return unwrapItem(await getRecord(getDataApiContext(), { id }));
}

export async function fetchRecordAttachments(id: string): Promise<RecordAttachmentData[]> {
  if (!hasDataApiContext()) return [];
  return unwrapList(await getRecordAttachments(getDataApiContext(), { id }));
}

export async function deleteRecordAttachment(recordId: string, attachmentId: string): Promise<void> {
  assertV4Success(await removeRecordAttachment(getDataApiContext(), { RecordId: recordId, AttachmentId: attachmentId }));
}

/**
 * Reconciliation across every connector (department administrators). The store's `fetchReconciliation` reads one
 * connector and replaces its list, so the department view is assembled here, one connector at a time.
 */
export async function fetchDepartmentReconciliation(connectorIds: readonly string[]): Promise<RecordDeploymentReconciliationData[]> {
  const pages = await Promise.all(
    connectorIds.map(async (id) => {
      try {
        return unwrapList(await getRecordDeploymentReconciliation(getDataApiContext(), { id }));
      } catch {
        // One unreachable connector must not hide the others' disagreements.
        return [];
      }
    })
  );
  return pages.flat();
}
