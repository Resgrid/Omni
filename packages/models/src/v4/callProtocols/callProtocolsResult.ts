import { BaseV4Request } from '../baseV4Request';
import { type CallProtocolsResultData, ProtocolResultData } from './callProtocolsResultData';

export class CallProtocolsResult extends BaseV4Request {
  public Data: CallProtocolsResultData[] = [];
}

/** `GET /Protocols/GetAllProtocols` (Core `GetAllProtocolsResult`): `ProtocolResultData` items, not `CallProtocolsResultData`. */
export class GetAllProtocolsResult extends BaseV4Request {
  public Data: ProtocolResultData[] = [];
}

/** `GET /Protocols/GetProtocol` (Core `GetProtocolResult`): one protocol in `Data`, not a list. */
export class GetProtocolResult extends BaseV4Request {
  public Data: ProtocolResultData = new ProtocolResultData();
}
