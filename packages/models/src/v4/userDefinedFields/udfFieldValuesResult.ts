import { BaseV4Request } from '../baseV4Request';
import { type UdfFieldValueResultData } from './udfFieldValueResultData';

export class UdfFieldValuesResult extends BaseV4Request {
  public Id: string = '';
  public Data: UdfFieldValueResultData[] = [];
}
