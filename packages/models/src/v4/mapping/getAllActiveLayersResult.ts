import { BaseV4Request } from '../baseV4Request';
import { type ActiveLayerResultData } from './activeLayerResultData';

export class GetAllActiveLayersResult extends BaseV4Request {
  public Data: ActiveLayerResultData[] = [];
}
