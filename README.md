# @sha3/crypto

Node.js TypeScript library that normalizes real-time crypto feeds across Binance, Coinbase, Kraken, OKX, and Chainlink.

It exposes a single backend-oriented API for:

- live unified events (`price`, `orderbook`, `trade`, `status`),
- resilient multi-provider connections,
- latest snapshots,
- historical range queries,
- nearest-price lookup by timestamp.

## TL;DR

```bash
npm i @sha3/crypto
```

```ts
import { CryptoFeedClient } from "@sha3/crypto";

const client = CryptoFeedClient.create({ symbols: ["btc"], providers: ["binance", "chainlink"] });

const subscription = client.subscribe((event) => {
  if (event.type === "price") {
    console.log(event.provider, event.symbol, event.price);
  }
});

await client.connect();

const now = Date.now();
const prices = client.getPriceHistory({ symbol: "btc", fromTs: now - 60_000, toTs: now });
console.log(prices.length);

subscription.unsubscribe();
await client.disconnect();
```

## Why This Exists

Provider payloads, symbols, and message semantics differ by exchange. This library isolates that complexity and provides one deterministic integration contract for application services and LLM-driven tooling.

## Installation

```bash
npm i @sha3/crypto
```

## Compatibility

- Node.js `>=20`
- ESM runtime (`"type": "module"`)
- TypeScript consumer support expected (package publishes `.d.ts`)
- Outbound websocket network access required

## Integration Guide (External Projects)

1. Install `@sha3/crypto`.
2. Import from package root only.
3. Create one `CryptoFeedClient` per service boundary.
4. Subscribe to feed events and route/persist as needed.
5. Query latest/historical data through client methods.

```ts
import { CryptoFeedClient } from "@sha3/crypto";

const client = CryptoFeedClient.create({
  symbols: ["btc", "eth"],
  providers: ["binance", "coinbase", "kraken", "okx", "chainlink"]
});

await client.connect();
```

Do not import internal modules like `src/*` from consuming projects.

## Public API Reference

### Class

- `CryptoFeedClient`
  - `static create(options?: ClientOptions): CryptoFeedClient`
  - `async connect(): Promise<void>`
  - `async disconnect(): Promise<void>`
  - `subscribe(listener: FeedEventListener): Subscription`
  - `getLatestPrice(symbol, provider?)`
  - `getLatestOrderBook(symbol, provider?)`
  - `getLatestTrade(symbol, provider?)`
  - `getPriceClosestTo(symbol, targetTs, provider?)`
  - `getPriceHistory(query)`
  - `getOrderBookHistory(query)`
  - `getTradeHistory(query)`

### Exported Types

- `ClientOptions`
- `HistoryQuery`
- `RetentionOptions`
- `FeedEvent`
- `PricePoint`
- `OrderBookSnapshot`
- `TradePoint`
- `CryptoProviderId`
- `CryptoSymbol`
- `Subscription`

### Exported Errors

- `NoProvidersConnectedError`
- `ProviderConnectionError`
- `ProviderParseError`
- `InvalidHistoryQueryError`

### Behavior Expectations

- `connect()` attempts all selected providers in parallel.
- `connect()` resolves if at least one provider connects.
- If all fail, `connect()` throws `NoProvidersConnectedError`.
- Range queries are inclusive (`fromTs <= ts <= toTs`).
- Aggregated history (without `provider`) is sorted by timestamp asc, then provider id.

## Configuration Reference (`src/config.ts`)

Runtime defaults are centralized in [`src/config.ts`](src/config.ts) as a single default object (`CONFIG`).

- `CONFIG.clientDefaults.symbols`
  - default symbol list when `ClientOptions.symbols` is omitted.
- `CONFIG.clientDefaults.providers`
  - default provider list when `ClientOptions.providers` is omitted.
- `CONFIG.clientDefaults.retention.windowMs`
  - in-memory retention window (ms).
- `CONFIG.clientDefaults.retention.maxSamplesPerStream`
  - max retained `price/orderbook` points per stream.
- `CONFIG.clientDefaults.retention.maxTradesPerStream`
  - max retained `trade` points per stream.
- `CONFIG.clientDefaults.orderBookLevels`
  - depth used by provider adapters.
- `CONFIG.providerConnection.reconnectBaseDelayMs`
  - initial reconnect delay.
- `CONFIG.providerConnection.reconnectMaxDelayMs`
  - max reconnect delay cap.
- `CONFIG.providerConnection.reconnectJitterRatio`
  - jitter factor for reconnect backoff.
- `CONFIG.providerConnection.connectTimeoutMs`
  - connect timeout per provider.
- `CONFIG.providerUrls.*`
  - websocket endpoints by provider.
- `CONFIG.chainlink.topic`
  - Chainlink subscription topic.

## Testing

Run deterministic checks:

```bash
npm run check
```

Run live integration tests against real providers:

```bash
npm run test:live
```

Live tests can skip provider-specific checks when endpoints are temporarily rate-limited or unavailable.

## Troubleshooting

### No providers connected

- Verify websocket egress from your environment.
- Inspect `status` events to identify the failing provider.

### Missing historical points

- Increase `ClientOptions.retention`.
- Ensure process uptime is long enough to accumulate data.

### ESM import errors

- Ensure consumer project supports ESM imports on Node.js 20+.

## AI Usage

When using assistants in this repo:

1. Treat `AGENTS.md` as blocking contract.
2. Keep class-first architecture and constructor injection.
3. Keep single-return policy and control-flow braces.
4. Keep `src/config.ts` as a single default object and import it as `import CONFIG from ".../config.js"`.
5. Update tests for behavior changes.
6. Run `npm run check` before finalizing.

## Development

```bash
npm install
npm run check
npm run test:live
npm run build
```
