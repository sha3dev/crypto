import type {
  FeedEvent,
  CryptoProviderId,
  CryptoSymbol,
  OrderBookSnapshot,
  PricePoint,
  TradePoint
} from "../providers/shared/provider-types.js";

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

export type CryptoClientPublicTypes = {
  FeedEvent: FeedEvent;
  PricePoint: PricePoint;
  OrderBookSnapshot: OrderBookSnapshot;
  TradePoint: TradePoint;
};
