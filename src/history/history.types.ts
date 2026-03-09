import type { CryptoProviderId, CryptoSymbol, OrderBookSnapshot, PricePoint, TradePoint } from "../provider/provider.types.ts";

export type HistoryEventType = "price" | "orderbook" | "trade";

export type HistoryDataPoint = PricePoint | OrderBookSnapshot | TradePoint;

export type HistoryRetentionConfig = {
  windowMs: number;
  maxSamplesPerStream: number;
  maxTradesPerStream: number;
};

export type HistoryRangeQuery = {
  eventType: HistoryEventType;
  symbol: CryptoSymbol;
  fromTs: number;
  toTs: number;
  provider?: CryptoProviderId;
};
