import { BaseV4Request } from '../baseV4Request';
import { type ResourceIncidentView } from './resourceIncidentView';

/** Envelope Status the server sends when the call has no incident command (Core ResponseHelper.NotFound). Unit compared against 'NotFound', which Core never sends. */
export const INCIDENT_VIEW_STATUS_NOT_FOUND = 'not_found';

export class ResourceIncidentViewResult extends BaseV4Request {
  /** Null when the call has no incident command (Status === 'not_found'). */
  public Data: ResourceIncidentView | null = null;
}
