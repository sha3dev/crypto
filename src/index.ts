export { CryptoFeedClient } from "./client/crypto-feed-client.service.ts";
export type {
  ClientOptions,
  FeedEventListener,
  HistoryQuery,
  RetentionOptions,
  Subscription,
} from "./client/client.types.ts";
export { NoProvidersConnectedError } from "./client/no-providers-connected.errors.ts";
export type {
  CryptoProviderId,
  CryptoSymbol,
  FeedEvent,
  OrderBookLevel,
  OrderBookSnapshot,
  PricePoint,
  ProviderStatusEvent,
  TradePoint,
} from "./providers/shared/provider.types.ts";
export { ProviderConnectionError } from "./providers/shared/provider-connection.errors.ts";
export { ProviderParseError } from "./providers/shared/provider-parse.errors.ts";
export { InvalidHistoryQueryError } from "./history/invalid-history-query.errors.ts";
