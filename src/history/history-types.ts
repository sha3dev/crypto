import type {
  CryptoProviderId,
  CryptoSymbol,
  OrderBookSnapshot,
  PricePoint,
  TradePoint
} from "../providers/shared/provider-types.js";

export type HistoryEventType = "price" | "orderbook" | "trade";

export type HistoryDataPoint = PricePoint | OrderBookSnapshot | TradePoint;

export type HistoryRetentionConfig = {
  windowMs: number;
  maxSamplesPerStream: number;
  maxTradesPerStream: number;
};

export type StreamDescriptor = {
  eventType: HistoryEventType;
  symbol: CryptoSymbol;
  provider: CryptoProviderId;
};

export type HistoryRangeQuery = {
  eventType: HistoryEventType;
  symbol: CryptoSymbol;
  fromTs: number;
  toTs: number;
  provider?: CryptoProviderId;
};
