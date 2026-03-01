import type { ProviderConnectionStatus } from "./provider-status.js";

export type CryptoProviderId = "binance" | "coinbase" | "kraken" | "okx" | "chainlink";

export type CryptoSymbol = string;

export type OrderBookLevel = { price: number; size: number };

export type PricePoint = {
  type: "price";
  provider: CryptoProviderId;
  symbol: CryptoSymbol;
  ts: number;
  price: number;
};

export type OrderBookSnapshot = {
  type: "orderbook";
  provider: CryptoProviderId;
  symbol: CryptoSymbol;
  ts: number;
  asks: OrderBookLevel[];
  bids: OrderBookLevel[];
};

export type TradePoint = {
  type: "trade";
  provider: CryptoProviderId;
  symbol: CryptoSymbol;
  ts: number;
  price: number;
  size: number;
  buyerIsMaker: boolean;
};

export type ProviderStatusEvent = {
  type: "status";
  provider: CryptoProviderId;
  ts: number;
  status: ProviderConnectionStatus;
  message: string;
};

export type ProviderDataEvent = PricePoint | OrderBookSnapshot | TradePoint;

export type FeedEvent = ProviderDataEvent | ProviderStatusEvent;

export type ProviderEventListener = (event: FeedEvent) => void;

export type ProviderContract = {
  readonly id: CryptoProviderId;
  connect(listener: ProviderEventListener): Promise<void>;
  disconnect(): Promise<void>;
};

export type ProviderBaseOptions = {
  reconnectBaseDelayMs: number;
  reconnectMaxDelayMs: number;
  reconnectJitterRatio: number;
  connectTimeoutMs: number;
};
