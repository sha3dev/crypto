/**
 * @section imports:externals
 */

// empty

/**
 * @section imports:internals
 */

import type { TimeUtils } from "../../shared/time-utils.js";
import CONFIG from "../../config.js";
import { BaseProvider, type WebSocketFactory } from "../shared/base-provider.js";
import type { ProviderBaseOptions, ProviderDataEvent } from "../shared/provider-types.js";
import type { OkxEnvelope } from "./okx-types.js";

/**
 * @section consts
 */

const OKX_WS_URL = CONFIG.providerUrls.okx;

/**
 * @section types
 */

type OkxProviderOptions = {
  symbols: string[];
  maxLevels: number;
  timeUtils: TimeUtils;
  wsFactory: WebSocketFactory;
  providerOptions: ProviderBaseOptions;
};

export class OkxProvider extends BaseProvider {
  /**
   * @section private:attributes
   */

  private readonly symbols: string[];
  private readonly maxLevels: number;

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

  public constructor(options: OkxProviderOptions) {
    super({
      id: "okx",
      timeUtils: options.timeUtils,
      wsFactory: options.wsFactory,
      providerOptions: options.providerOptions
    });
    this.symbols = options.symbols;
    this.maxLevels = options.maxLevels;
  }

  /**
   * @section static:properties
   */

  // empty

  /**
   * @section factory
   */

  public static create(options: OkxProviderOptions): OkxProvider {
    const provider = new OkxProvider(options);
    return provider;
  }

  /**
   * @section private:methods
   */

  private toExchangeSymbol(symbol: string): string {
    const exchangeSymbol = `${symbol.toUpperCase()}-USDT`;
    return exchangeSymbol;
  }

  private toSymbol(exchangeSymbol: string): string {
    const symbol = exchangeSymbol.split("-")[0]?.toLowerCase() ?? "";
    return symbol;
  }

  private parseDepthSide(rawLevels: unknown[]): { price: number; size: number }[] {
    const levels: { price: number; size: number }[] = [];

    for (const rawLevel of rawLevels) {
      const level = rawLevel as [string, string];
      const price = Number(level[0]);
      const size = Number(level[1]);

      if (Number.isFinite(price) && Number.isFinite(size)) {
        levels.push({ price, size });
      }
    }

    return levels;
  }

  /**
   * @section protected:methods
   */

  // empty

  protected getConnectionUrl(): string {
    const url = OKX_WS_URL;
    return url;
  }

  protected buildSubscriptionMessages(): string[] {
    const tickerArgs: { channel: string; instId: string }[] = [];
    const bookArgs: { channel: string; instId: string }[] = [];

    for (const symbol of this.symbols) {
      const instId = this.toExchangeSymbol(symbol);
      tickerArgs.push({ channel: "tickers", instId });
      bookArgs.push({ channel: "books5", instId });
    }

    const ticker = JSON.stringify({ op: "subscribe", args: tickerArgs });
    const book = JSON.stringify({ op: "subscribe", args: bookArgs });
    const messages = [ticker, book];
    return messages;
  }

  protected parseMessage(message: string): ProviderDataEvent[] {
    const events: ProviderDataEvent[] = [];
    const envelope = JSON.parse(message) as OkxEnvelope;
    const channel = envelope.arg?.channel ?? "";
    const instId = envelope.arg?.instId ?? "";
    const symbol = this.toSymbol(instId);
    const rows = envelope.data ?? [];

    if (channel === "tickers") {
      for (const row of rows) {
        const ts = Number(row.ts);
        const price = Number(row.last);
        const isValid = symbol.length > 0 && Number.isFinite(ts) && Number.isFinite(price);

        if (isValid) {
          events.push({ type: "price", provider: this.id, symbol, ts, price });
        }
      }
    }

    if (channel === "books5") {
      for (const row of rows) {
        const ts = Number(row.ts);
        const asksRaw = Array.isArray(row.asks) ? row.asks : [];
        const bidsRaw = Array.isArray(row.bids) ? row.bids : [];
        const asks = this.parseDepthSide(asksRaw).sort((left, right) => {
          const comparison = left.price - right.price;
          return comparison;
        });
        const bids = this.parseDepthSide(bidsRaw).sort((left, right) => {
          const comparison = right.price - left.price;
          return comparison;
        });
        const isValid = symbol.length > 0 && Number.isFinite(ts);

        if (isValid) {
          events.push({
            type: "orderbook",
            provider: this.id,
            symbol,
            ts,
            asks: asks.slice(0, this.maxLevels),
            bids: bids.slice(0, this.maxLevels)
          });
        }
      }
    }

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
