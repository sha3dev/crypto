export { CryptoFeedClient } from "./client/crypto-feed-client.js";
export type {
  ClientOptions,
  FeedEventListener,
  HistoryQuery,
  RetentionOptions,
  Subscription
} from "./client/client-types.js";
export { NoProvidersConnectedError } from "./client/no-providers-connected-error.js";
export type {
  CryptoProviderId,
  CryptoSymbol,
  FeedEvent,
  OrderBookLevel,
  OrderBookSnapshot,
  PricePoint,
  ProviderStatusEvent,
  TradePoint
} from "./providers/shared/provider-types.js";
export { ProviderConnectionError } from "./providers/shared/provider-connection-error.js";
export { ProviderParseError } from "./providers/shared/provider-parse-error.js";
export { InvalidHistoryQueryError } from "./history/invalid-history-query-error.js";
