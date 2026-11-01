import { BaseV4Request } from '../baseV4Request';
import { type FormResultData } from './formResultData';

export class FormsResult extends BaseV4Request {
  public Data: FormResultData[] = [];
}
