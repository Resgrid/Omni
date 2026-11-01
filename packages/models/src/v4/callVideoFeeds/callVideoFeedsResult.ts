import { BaseV4Request } from '../baseV4Request';
import { type CallVideoFeedResultData } from './callVideoFeedResultData';

export class CallVideoFeedsResult extends BaseV4Request {
  public Data: CallVideoFeedResultData[] = [];
}
