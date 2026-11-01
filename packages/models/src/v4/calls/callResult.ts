import { BaseV4Request } from '../baseV4Request';
import { CallResultData } from './callResultData';

/** Response of `Calls/GetCall`. */
export class CallResult extends BaseV4Request {
  public Data: CallResultData = new CallResultData();
}
