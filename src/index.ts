export { CryptoFeedClient } from "./client/client.service.ts";
export { NoProvidersConnectedError } from "./client/client.errors.ts";
export type {
  ClientOptions,
  FeedEventListener,
  HistoryQuery,
  RetentionOptions,
  Subscription,
} from "./client/client.types.ts";
export type {
  CryptoProviderId,
  CryptoSymbol,
  FeedEvent,
  OrderBookLevel,
  OrderBookSnapshot,
  PricePoint,
  ProviderStatusEvent,
  TradePoint,
} from "./provider/provider.types.ts";
