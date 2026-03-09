import type { CryptoProviderId, CryptoSymbol, FeedEvent, OrderBookSnapshot, PricePoint, TradePoint } from "../provider/provider.types.ts";

export type HistoryQuery = {
  symbol: CryptoSymbol;
  fromTs: number;
  toTs: number;
  provider?: CryptoProviderId;
};

export type RetentionOptions = {
  windowMs: number;
  maxSamplesPerStream: number;
  maxTradesPerStream: number;
};

export type ClientOptions = {
  symbols?: CryptoSymbol[];
  providers?: CryptoProviderId[];
  retention?: Partial<RetentionOptions>;
};

export type FeedEventListener = (event: FeedEvent) => void;

export type Subscription = {
  unsubscribe(): void;
};

export type ClientQueryResult = {
  latestPrice: PricePoint | null;
  latestOrderBook: OrderBookSnapshot | null;
  latestTrade: TradePoint | null;
};
