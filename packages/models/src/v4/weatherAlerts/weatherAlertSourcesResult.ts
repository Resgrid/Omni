import { BaseV4Request } from '../baseV4Request';
import { type WeatherAlertSourceResultData } from './weatherAlertSourceResultData';

export class WeatherAlertSourcesResult extends BaseV4Request {
  public Data: WeatherAlertSourceResultData[] = [];
}
