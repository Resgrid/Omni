import { BaseV4Request } from '../baseV4Request';
import { type CallQuickTemplateResultData } from './callQuickTemplateResultData';

export class CallQuickTemplatesResult extends BaseV4Request {
  public Data: CallQuickTemplateResultData[] = [];
}
