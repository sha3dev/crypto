# @sha3/crypto

Node.js TypeScript library that normalizes live crypto feed data from Binance, Coinbase, Kraken, OKX, and Chainlink into one client API with in-memory history queries.

## TL;DR

```bash
npm install
npm run test
npm run build
```

```ts
import { CryptoFeedClient } from "@sha3/crypto";

const client = CryptoFeedClient.create({ symbols: ["btc"] });
await client.connect();
console.log(client.getLatestPrice("btc"));
await client.disconnect();
```

## Why

- Normalizes multiple websocket feeds behind one client API.
- Keeps recent prices, order books, and trades in memory for immediate query access.
- Ships as a Node.js 20+ ESM package with deterministic tests and contract-driven structure.

## Installation

```bash
npm install @sha3/crypto
```

## Usage

```ts
import { CryptoFeedClient } from "@sha3/crypto";

const client = CryptoFeedClient.create({
  symbols: ["btc", "eth"],
  providers: ["binance", "coinbase"],
});

await client.connect();

const subscription = client.subscribe((event) => {
  if (event.type === "price") {
    console.log(event.provider, event.symbol, event.price);
  }
});

console.log(client.getLatestPrice("btc"));

subscription.unsubscribe();
await client.disconnect();
```

## Examples

Subscribe to a single symbol:

```ts
import { CryptoFeedClient } from "@sha3/crypto";

const client = CryptoFeedClient.create({ symbols: ["btc"] });
const subscription = client.subscribe((event) => {
  if (event.type === "price") {
    console.log(event.price);
  }
});

await client.connect();
subscription.unsubscribe();
await client.disconnect();
```

Read inclusive in-memory history:

```ts
const priceHistory = client.getPriceHistory({
  symbol: "btc",
  fromTs: Date.now() - 60_000,
  toTs: Date.now(),
});
```

Inject test providers:

```ts
import { CryptoFeedClient } from "@sha3/crypto";

const client = CryptoFeedClient.fromProviders([]);
```

## Public API

### `CryptoFeedClient`

Creates provider connections, normalizes incoming events, stores in-memory history, and exposes query methods.

#### `create(clientOptions?)`

Builds a client with the default package wiring.

Returns:

- `CryptoFeedClient`

Behavior notes:

- normalizes configured symbols before provider creation
- creates history retention from defaults plus optional overrides
- creates all configured providers up front

#### `fromProviders(providers, retentionOverrides?)`

Builds a client from caller-supplied providers.

Returns:

- `CryptoFeedClient`

Behavior notes:

- useful for tests and custom transport wiring
- uses the same history and query behavior as `create()`

#### `connect()`

Connects all configured providers in parallel.

Returns:

- `Promise<void>`

Behavior notes:

- succeeds when at least one provider connects
- throws `NoProvidersConnectedError` when every provider fails
- logs partial-connect warnings when only some providers fail

#### `disconnect()`

Disconnects all providers and clears subscriptions.

Returns:

- `Promise<void>`

Behavior notes:

- attempts every provider disconnect
- clears active listeners after disconnect settles

#### `subscribe(listener)`

Registers a feed listener.

Returns:

- `Subscription`

Behavior notes:

- listener receives normalized `FeedEvent` values
- returned `unsubscribe()` removes only that listener

#### `getLatestPrice(symbol, provider?)`

Returns:

- `PricePoint | null`

Behavior notes:

- reads the latest price in memory for a symbol or symbol/provider pair

#### `getLatestOrderBook(symbol, provider?)`

Returns:

- `OrderBookSnapshot | null`

Behavior notes:

- reads the latest in-memory order book snapshot

#### `getLatestTrade(symbol, provider?)`

Returns:

- `TradePoint | null`

Behavior notes:

- reads the latest in-memory trade point

#### `getPriceClosestTo(symbol, targetTs, provider?)`

Returns:

- `PricePoint | null`

Behavior notes:

- throws `Error` when `targetTs` is not finite
- tie-breaking prefers the lower timestamp

#### `getPriceHistory(query)`

Returns:

- `PricePoint[]`

Behavior notes:

- range is inclusive on both ends

#### `getOrderBookHistory(query)`

Returns:

- `OrderBookSnapshot[]`

Behavior notes:

- range is inclusive on both ends

#### `getTradeHistory(query)`

Returns:

- `TradePoint[]`

Behavior notes:

- range is inclusive on both ends

#### `notifyListeners(event)`

Returns:

- `void`

Behavior notes:

- forwards a normalized feed event to every active subscriber

#### `handleProviderEvent(event)`

Returns:

- `void`

Behavior notes:

- appends non-status events into in-memory history before notifying subscribers

### `NoProvidersConnectedError`

Thrown when `connect()` fails for every configured provider.

#### `getFailedProviders()`

Returns:

- `string[]`

Behavior notes:

- returns the provider ids that failed to connect

### `ClientOptions`

Options object for `CryptoFeedClient.create()`.

Behavior notes:

- `symbols` overrides the default tracked symbols
- `providers` overrides the default provider list
- `retention` overrides in-memory retention settings

### `FeedEventListener`

Callback type used by `subscribe(listener)`.

### `HistoryQuery`

Inclusive history query with `symbol`, `fromTs`, `toTs`, and optional `provider`.

### `RetentionOptions`

Retention settings for in-memory window and per-stream limits.

### `Subscription`

Return type from `subscribe(listener)` with `unsubscribe(): void`.

### `CryptoProviderId`

Provider id union: `binance | coinbase | kraken | okx | chainlink`.

### `CryptoSymbol`

Normalized lowercase symbol string such as `btc`.

### `FeedEvent`

Union of `PricePoint`, `OrderBookSnapshot`, `TradePoint`, and `ProviderStatusEvent`.

### `OrderBookLevel`

Order book level with `price` and `size`.

### `OrderBookSnapshot`

Normalized order book event with asks, bids, timestamp, provider, and symbol.

### `PricePoint`

Normalized price event with timestamp, provider, symbol, and price.

### `ProviderStatusEvent`

Provider lifecycle event with `connected`, `reconnecting`, `error`, or `disconnected` status.

### `TradePoint`

Normalized trade event with price, size, timestamp, provider, symbol, and maker flag.

## Compatibility

- Node.js 20+
- ESM runtime
- outbound websocket access for live feeds

## Configuration

Configuration lives in `src/config.ts`.

- `config.PACKAGE_NAME`: package logger and identity string.
- `config.clientDefaults`: default symbols, provider list, retention values, and order book depth used by `CryptoFeedClient.create()`.
- `config.providerConnection`: reconnect backoff, jitter, and connect timeout used by provider transports.
- `config.providerUrls`: websocket endpoints for Binance, Coinbase, Kraken, OKX, and Chainlink.
- `config.chainlink`: Chainlink-specific subscription configuration.

Top-level configuration keys:

- `config.PACKAGE_NAME`
- `config.clientDefaults`
- `config.providerConnection`
- `config.providerUrls`
- `config.chainlink`

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

- `src/client`: public client API and public error/type surface
- `src/history`: in-memory retention and history query behavior
- `src/provider`: shared provider transport contract and websocket base service
- `src/binance`, `src/coinbase`, `src/kraken`, `src/okx`, `src/chainlink`: provider adapters
- `src/order-book`, `src/symbol`, `src/time`: shared internal services
- `src/package-info`: scaffold-required internal package-info service
- `test`: smoke, client, history, provider, and optional live integration coverage

## Troubleshooting

### No providers connected

- Verify websocket egress from the current runtime.
- Subscribe to `status` events to inspect provider errors before `connect()` fails.
- Reduce the provider list while debugging one exchange at a time.

### Missing historical points

- Increase `retention.windowMs` or per-stream limits in `CryptoFeedClient.create({ retention: ... })`.
- Keep the process running long enough to accumulate data in memory.
- Query with normalized symbols such as `btc`.

### ESM or import issues

- Ensure the consumer runs on Node.js 20+.
- Import from the package root rather than internal source files.

### Check failures

- Run `npm run standards:check`, `npm run typecheck`, and `npm run test`.
- Treat managed-file and Biome configuration failures separately from runtime library issues.

## AI Workflow

- Read `AGENTS.md`, `ai/contract.json`, `ai/rules.md`, and the relevant `ai/<assistant>.md` file before editing.
- Keep managed files read-only unless this is an explicit standards update.
- Use the legacy snapshot only as behavioral reference during refactors.
- Run `npm run check` before finalizing changes.
