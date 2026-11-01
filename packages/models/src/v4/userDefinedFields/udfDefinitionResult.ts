import { BaseV4Request } from '../baseV4Request';
import { type UdfDefinitionResultData } from './udfDefinitionResultData';

export class UdfDefinitionResult extends BaseV4Request {
  public Id: string = '';
  public Data: UdfDefinitionResultData | null = null;
}
