# @sha3/crypto

Node.js TypeScript library that normalizes crypto `price`, `orderbook`, and `trade` feeds across Binance, Coinbase, Kraken, OKX, and Chainlink.

It provides one integration contract for backend services and LLM agents:

- unified event model,
- resilient multi-provider connection,
- latest snapshots,
- historical range/closest-time queries.

## Quick Start (under 60s)

```bash
npm i @sha3/crypto
```

```ts
import { CryptoFeedClient } from "@sha3/crypto";

const client = CryptoFeedClient.create({ symbols: ["btc"], providers: ["binance", "chainlink"] });

const sub = client.subscribe((event) => {
  if (event.type === "price") {
    console.log(event.provider, event.symbol, event.price);
  }
});

await client.connect();

const now = Date.now();
const history = client.getPriceHistory({ symbol: "btc", fromTs: now - 60_000, toTs: now });
console.log("points", history.length);

sub.unsubscribe();
await client.disconnect();
```

## Why This Library Exists

Each exchange uses different websocket payloads, symbols, and book/trade formats.
This library isolates those differences and exposes a deterministic API so application code stays provider-agnostic.

## Compatibility

- Runtime: Node.js `>=20`
- Module system: ESM (`"type": "module"`)
- TypeScript: strict mode expected in consuming projects
- Transport: websocket egress required to provider endpoints

## Installation

```bash
npm i @sha3/crypto
```

## Integration Guide (External Projects)

1. Install `@sha3/crypto`.
2. Import only from the package entrypoint.
3. Create one `CryptoFeedClient` per service boundary.
4. Subscribe to feed events and persist/route as needed.
5. Use query methods for latest/historical access.

```ts
import { CryptoFeedClient } from "@sha3/crypto";

const client = CryptoFeedClient.create({
  symbols: ["btc", "eth"],
  providers: ["binance", "coinbase", "kraken", "okx", "chainlink"]
});

await client.connect();
```

Do not import internal paths such as `src/*` from consumers.

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

- `connect()` attempts all providers in parallel.
- `connect()` succeeds when at least one provider connects.
- If all providers fail, `connect()` throws `NoProvidersConnectedError`.
- Historical range queries are inclusive (`fromTs <= ts <= toTs`).
- Aggregated queries (without `provider`) are sorted by timestamp asc, then provider name.

## Configuration Reference (`src/config.ts`)

Configuration is centralized in [`src/config.ts`](src/config.ts) and exported as default `CONFIG`.

- `CONFIG.clientDefaults.symbols`:
  default symbols used when `ClientOptions.symbols` is omitted.
- `CONFIG.clientDefaults.providers`:
  default providers used when `ClientOptions.providers` is omitted.
- `CONFIG.clientDefaults.retention.windowMs`:
  in-memory retention window in milliseconds.
- `CONFIG.clientDefaults.retention.maxSamplesPerStream`:
  max retained `price/orderbook` points per stream.
- `CONFIG.clientDefaults.retention.maxTradesPerStream`:
  max retained `trade` points per stream.
- `CONFIG.clientDefaults.orderBookLevels`:
  per-provider book depth used in provider adapters.
- `CONFIG.providerConnection.*`:
  reconnect backoff and connect timeout defaults.
- `CONFIG.providerUrls.*`:
  websocket endpoints by provider.
- `CONFIG.chainlink.topic`:
  topic used for Chainlink subscription payload.

## Live Integration Tests

Run deterministic unit/integration suite:

```bash
npm run check
```

Run live provider connectivity tests (real websocket data):

```bash
npm run test:live
```

Live tests are network-dependent and may be skipped when a provider is temporarily rate-limited.

## Troubleshooting

### No providers connected

- Verify outbound websocket connectivity from your runtime.
- Review emitted `status` events for provider-specific error messages.

### Sparse historical data

- Increase retention in `ClientOptions.retention`.
- Ensure process uptime is long enough to accumulate points.

### ESM import problems

- Ensure consumer project supports ESM imports.
- Use Node.js 20+.

## AI Usage

If you use assistants in this repository:

1. Treat `AGENTS.md` as blocking contract.
2. Follow class-first + constructor injection rules.
3. Keep single-return policy and braces policy.
4. Keep `src/config.ts` as single default config object (`import CONFIG from ".../config.js"`).
5. Add/update tests on behavior changes.
6. Run `npm run check` before finalizing.

## Development Commands

```bash
npm install
npm run check
npm run test:live
npm run build
```
