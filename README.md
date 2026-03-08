# @sha3/crypto

Node.js TypeScript library that normalizes real-time crypto feeds across Binance, Coinbase, Kraken, OKX, and Chainlink.

## TL;DR

```bash
npm install
npm run check
npm run build
```

## Installation

```bash
npm install @sha3/crypto
```

## Compatibility

Requirements:

- Node.js 20+
- ESM runtime
- outbound websocket access for live feeds

## Public API

```ts
import { CryptoFeedClient } from "@sha3/crypto";

const client = CryptoFeedClient.create({
  symbols: ["btc", "eth"],
  providers: ["binance", "coinbase"]
});

await client.connect();

const subscription = client.subscribe((event) => {
  if (event.type === "price") {
    console.log(event.provider, event.symbol, event.price);
  }
});

const latestPrice = client.getLatestPrice("btc");
subscription.unsubscribe();
await client.disconnect();
```

Root exports:

- `CryptoFeedClient`
- `ClientOptions`
- `FeedEventListener`
- `HistoryQuery`
- `RetentionOptions`
- `Subscription`
- `CryptoProviderId`
- `CryptoSymbol`
- `FeedEvent`
- `OrderBookLevel`
- `OrderBookSnapshot`
- `PricePoint`
- `ProviderStatusEvent`
- `TradePoint`
- `NoProvidersConnectedError`
- `ProviderConnectionError`
- `ProviderParseError`
- `InvalidHistoryQueryError`

Behavior notes:

- `connect()` attempts all configured providers in parallel.
- `connect()` succeeds when at least one provider connects.
- `connect()` throws `NoProvidersConnectedError` when every provider fails.
- history queries are inclusive
- merged history is sorted by timestamp ascending, then provider id

## Integration Guide

1. Install the package from npm.
2. Import only from the package root.
3. Create one `CryptoFeedClient` per application boundary.
4. Subscribe to events and persist or route them in your service layer.
5. Query in-memory latest and historical views through the client methods.

## Configuration

Configuration lives in `src/config.ts`.

- `config.PACKAGE_NAME`
- `config.clientDefaults.symbols`
- `config.clientDefaults.providers`
- `config.clientDefaults.retention.windowMs`
- `config.clientDefaults.retention.maxSamplesPerStream`
- `config.clientDefaults.retention.maxTradesPerStream`
- `config.clientDefaults.orderBookLevels`
- `config.providerConnection.reconnectBaseDelayMs`
- `config.providerConnection.reconnectMaxDelayMs`
- `config.providerConnection.reconnectJitterRatio`
- `config.providerConnection.connectTimeoutMs`
- `config.providerUrls.binance`
- `config.providerUrls.coinbase`
- `config.providerUrls.kraken`
- `config.providerUrls.okx`
- `config.providerUrls.chainlink`
- `config.chainlink.topic`

## Scripts

- `npm run standards:check`
- `npm run lint`
- `npm run format:check`
- `npm run typecheck`
- `npm run test`
- `npm run check`
- `npm run build`
- `npm run test:live`

## Structure

- `src/client`: public client API and root-facing errors/types
- `src/history`: in-memory retention and query semantics
- `src/providers`: provider contracts and transport adapters
- `src/shared`: shared internal services
- `src/package-info`: scaffold-kept internal service
- `test`: behavior, parser, reconnect, and live integration coverage

## Troubleshooting

### No providers connected

- Verify websocket egress from the current environment.
- Subscribe to `status` events to inspect provider failures.

### Missing historical points

- Increase retention in `CryptoFeedClient.create({ retention: ... })`.
- Keep the process alive long enough to accumulate in-memory history.

### ESM import issues

- Ensure the consumer runs on Node.js 20+ with ESM enabled.

## AI Workflow

- Read `AGENTS.md`, `ai/contract.json`, and the relevant adapter file before editing.
- Keep managed files read-only unless this is an explicit standards update.
- Preserve only the approved contract surfaces during refactors.
- Run `npm run check` before finishing.
