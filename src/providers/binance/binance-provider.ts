/**
 * @section imports:externals
 */

// empty

/**
 * @section imports:internals
 */

import type { ProviderBaseOptions, ProviderDataEvent } from "../shared/provider-types.js";
import type { BinanceAggTrade, BinanceDepth, BinanceStreamEnvelope } from "./binance-types.js";
import { BaseProvider, type WebSocketFactory } from "../shared/base-provider.js";
import type { TimeUtils } from "../../shared/time-utils.js";
import CONFIG from "../../config.ts";

/**
 * @section consts
 */

const BINANCE_WS_URL = CONFIG.providerUrls.binance;

/**
 * @section types
 */

type BinanceProviderOptions = {
  symbols: string[];
  timeUtils: TimeUtils;
  wsFactory: WebSocketFactory;
  providerOptions: ProviderBaseOptions;
};
type DepthLevel = { price: number; size: number };
type ParseMessageOptions = { stream: string; data: unknown; events: ProviderDataEvent[] };

export class BinanceProvider extends BaseProvider {
  /**
   * @section private:attributes
   */

  private readonly symbols: string[];

  /**
   * @section protected:attributes
   */

  // empty

  /**
   * @section private:properties
   */

  // empty

  /**
   * @section public:properties
   */

  // empty

  /**
   * @section constructor
   */

  public constructor(options: BinanceProviderOptions) {
    super({
      id: "binance",
      timeUtils: options.timeUtils,
      wsFactory: options.wsFactory,
      providerOptions: options.providerOptions
    });
    this.symbols = options.symbols;
  }

  /**
   * @section static:properties
   */

  // empty

  /**
   * @section factory
   */

  public static create(options: BinanceProviderOptions): BinanceProvider {
    const provider = new BinanceProvider(options);
    return provider;
  }

  /**
   * @section private:methods
   */

  private toPair(symbol: string): string {
    const pair = `${symbol.toLowerCase()}usdt`;
    return pair;
  }

  private toSymbol(stream: string): string {
    const pair = stream.split("@")[0] ?? "";
    const symbol = pair.slice(0, 3).toLowerCase();
    return symbol;
  }

  private parseDepthLevels(rawLevels: [string, string][]): DepthLevel[] {
    const levels: DepthLevel[] = [];

    for (const rawLevel of rawLevels) {
      const price = Number(rawLevel[0]);
      const size = Number(rawLevel[1]);

      if (Number.isFinite(price) && Number.isFinite(size)) {
        levels.push({ price, size });
      }
    }

    return levels;
  }

  private appendAggTradeEvents(options: ParseMessageOptions): void {
    if (options.stream.includes("@aggTrade")) {
      const payload = options.data as BinanceAggTrade;
      const symbol = this.toSymbol(options.stream);
      const ts = Number(payload.E);
      const price = Number(payload.p);
      const size = Number(payload.q);
      const buyerIsMaker = Boolean(payload.m);
      const isValid =
        symbol.length > 0 && Number.isFinite(ts) && Number.isFinite(price) && Number.isFinite(size);

      if (isValid) {
        options.events.push({ type: "price", provider: this.id, symbol, ts, price });
        options.events.push({
          type: "trade",
          provider: this.id,
          symbol,
          ts,
          price,
          size,
          buyerIsMaker
        });
      }
    }
  }

  private appendDepthEvents(options: ParseMessageOptions): void {
    if (options.stream.includes("@depth")) {
      const payload = options.data as BinanceDepth;
      const rawAsks = payload.asks ?? payload.a ?? [];
      const rawBids = payload.bids ?? payload.b ?? [];
      const symbol = this.toSymbol(options.stream);
      const ts = Number(payload.E ?? Date.now());
      const asks = this.parseDepthLevels(rawAsks).sort((left, right) => {
        const comparison = left.price - right.price;
        return comparison;
      });
      const bids = this.parseDepthLevels(rawBids).sort((left, right) => {
        const comparison = right.price - left.price;
        return comparison;
      });
      const isValid = symbol.length > 0 && Number.isFinite(ts);

      if (isValid) {
        options.events.push({ type: "orderbook", provider: this.id, symbol, ts, asks, bids });
      }
    }
  }

  /**
   * @section protected:methods
   */

  protected getConnectionUrl(): string {
    const streams: string[] = [];

    for (const symbol of this.symbols) {
      const pair = this.toPair(symbol);
      streams.push(`${pair}@aggTrade`);
      streams.push(`${pair}@depth5@100ms`);
    }

    const url = `${BINANCE_WS_URL}?streams=${streams.join("/")}`;
    return url;
  }

  protected buildSubscriptionMessages(): string[] {
    const messages: string[] = [];
    return messages;
  }

  protected parseMessage(message: string): ProviderDataEvent[] {
    const events: ProviderDataEvent[] = [];
    const envelope = JSON.parse(message) as BinanceStreamEnvelope;
    const stream = envelope.stream ?? "";
    const options: ParseMessageOptions = { stream, data: envelope.data, events };
    this.appendAggTradeEvents(options);
    this.appendDepthEvents(options);

    return events;
  }

  /**
   * @section public:methods
   */

  // empty

  /**
   * @section static:methods
   */

  // empty
}
