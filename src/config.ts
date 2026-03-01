const CONFIG = {
  clientDefaults: {
    symbols: ["btc", "eth", "sol", "xrp"],
    providers: ["binance", "coinbase", "kraken", "okx", "chainlink"],
    retention: {
      windowMs: 15 * 60 * 1_000,
      maxSamplesPerStream: 30_000,
      maxTradesPerStream: 60_000
    },
    orderBookLevels: 10
  },
  providerConnection: {
    reconnectBaseDelayMs: 2_000,
    reconnectMaxDelayMs: 30_000,
    reconnectJitterRatio: 0.25,
    connectTimeoutMs: 10_000
  },
  providerUrls: {
    binance: "wss://stream.binance.com:9443/stream",
    coinbase: "wss://ws-feed.exchange.coinbase.com",
    kraken: "wss://ws.kraken.com/v2",
    okx: "wss://ws.okx.com:8443/ws/v5/public",
    chainlink: "wss://ws-live-data.polymarket.com"
  },
  chainlink: {
    topic: "crypto_prices_chainlink"
  }
} as const;

export default CONFIG;
