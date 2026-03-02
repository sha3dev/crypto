/**
 * @section imports:externals
 */

// empty

/**
 * @section imports:internals
 */

import type { OrderBookMerger } from "../../shared/order-book-merger.js";
import type { TimeUtils } from "../../shared/time-utils.js";
import CONFIG from "../../config.ts";
import { BaseProvider, type WebSocketFactory } from "../shared/base-provider.js";
import type { ProviderBaseOptions, ProviderDataEvent } from "../shared/provider-types.js";
import type { KrakenEnvelope, KrakenLocalBook } from "./kraken-types.js";

/**
 * @section consts
 */

const KRAKEN_WS_URL = CONFIG.providerUrls.kraken;

/**
 * @section types
 */

type KrakenProviderOptions = {
  symbols: string[];
  maxLevels: number;
  timeUtils: TimeUtils;
  wsFactory: WebSocketFactory;
  providerOptions: ProviderBaseOptions;
  bookMerger: OrderBookMerger;
};
type DepthLevel = { price: number; size: number };
type AppendKrakenEventsOptions = {
  events: ProviderDataEvent[];
  channel: string;
  rows: Array<Record<string, unknown>>;
  kind: string;
};

export class KrakenProvider extends BaseProvider {
  /**
   * @section private:attributes
   */

  private readonly symbols: string[];
  private readonly maxLevels: number;
  private readonly bookMerger: OrderBookMerger;

  /**
   * @section protected:attributes
   */

  // empty

  /**
   * @section private:properties
   */

  private readonly booksBySymbol: Map<string, KrakenLocalBook>;

  /**
   * @section public:properties
   */

  // empty

  /**
   * @section constructor
   */

  public constructor(options: KrakenProviderOptions) {
    super({
      id: "kraken",
      timeUtils: options.timeUtils,
      wsFactory: options.wsFactory,
      providerOptions: options.providerOptions
    });
    this.symbols = options.symbols;
    this.maxLevels = options.maxLevels;
    this.bookMerger = options.bookMerger;
    this.booksBySymbol = new Map<string, KrakenLocalBook>();
  }

  /**
   * @section static:properties
   */

  // empty

  /**
   * @section factory
   */

  public static create(options: KrakenProviderOptions): KrakenProvider {
    const provider = new KrakenProvider(options);
    return provider;
  }

  /**
   * @section private:methods
   */

  private toExchangeSymbol(symbol: string): string {
    const exchangeSymbol = `${symbol.toUpperCase()}/USD`;
    return exchangeSymbol;
  }

  private toSymbol(exchangeSymbol: string): string {
    const symbol = exchangeSymbol.split("/")[0]?.toLowerCase() ?? "";
    return symbol;
  }

  private parseBookLevels(rawLevels: unknown[]): DepthLevel[] {
    const levels: DepthLevel[] = [];

    for (const rawLevel of rawLevels) {
      const level = rawLevel as { price?: number; qty?: number };
      const price = Number(level.price);
      const size = Number(level.qty);

      if (Number.isFinite(price) && Number.isFinite(size)) {
        levels.push({ price, size });
      }
    }

    return levels;
  }

  private saveSnapshot(symbol: string, rawAsks: unknown[], rawBids: unknown[]): KrakenLocalBook {
    const asks = this.parseBookLevels(rawAsks).sort((left, right) => {
      const comparison = left.price - right.price;
      return comparison;
    });
    const bids = this.parseBookLevels(rawBids).sort((left, right) => {
      const comparison = right.price - left.price;
      return comparison;
    });
    const book: KrakenLocalBook = {
      symbol,
      asks: asks.slice(0, this.maxLevels),
      bids: bids.slice(0, this.maxLevels)
    };
    this.booksBySymbol.set(symbol, book);
    return book;
  }

  private applyUpdate(
    symbol: string,
    rawAsks: unknown[],
    rawBids: unknown[]
  ): KrakenLocalBook | null {
    const current = this.booksBySymbol.get(symbol) ?? null;
    let book: KrakenLocalBook | null = null;

    if (current) {
      const deltaAsks = this.parseBookLevels(rawAsks);
      const deltaBids = this.parseBookLevels(rawBids);
      const merged = this.bookMerger.merge({
        currentAsks: current.asks,
        currentBids: current.bids,
        deltaAsks,
        deltaBids,
        maxLevels: this.maxLevels
      });
      book = { symbol, asks: merged.asks, bids: merged.bids };
      this.booksBySymbol.set(symbol, book);
    }

    return book;
  }

  private appendTickerEvents(options: AppendKrakenEventsOptions): void {
    if (options.channel === "ticker") {
      for (const row of options.rows) {
        const symbol = this.toSymbol(String(row.symbol ?? ""));
        const ts = Number(new Date(String(row.timestamp ?? "")).getTime());
        const price = Number(row.last);
        const isValid = symbol.length > 0 && Number.isFinite(ts) && Number.isFinite(price);

        if (isValid) {
          options.events.push({ type: "price", provider: this.id, symbol, ts, price });
        }
      }
    }
  }

  private appendBookEvents(options: AppendKrakenEventsOptions): void {
    if (options.channel === "book") {
      for (const row of options.rows) {
        const symbol = this.toSymbol(String(row.symbol ?? ""));
        const ts = Number(new Date(String(row.timestamp ?? "")).getTime());
        const rawAsks = Array.isArray(row.asks) ? row.asks : [];
        const rawBids = Array.isArray(row.bids) ? row.bids : [];
        let book: KrakenLocalBook | null = null;

        if (options.kind === "snapshot") {
          book = this.saveSnapshot(symbol, rawAsks, rawBids);
        } else {
          book = this.applyUpdate(symbol, rawAsks, rawBids);
        }

        const isValid = symbol.length > 0 && Number.isFinite(ts) && Boolean(book);

        if (isValid && book) {
          options.events.push({
            type: "orderbook",
            provider: this.id,
            symbol,
            ts,
            asks: book.asks,
            bids: book.bids
          });
        }
      }
    }
  }

  /**
   * @section protected:methods
   */

  protected getConnectionUrl(): string {
    const url = KRAKEN_WS_URL;
    return url;
  }

  protected buildSubscriptionMessages(): string[] {
    const symbols: string[] = [];

    for (const symbol of this.symbols) {
      symbols.push(this.toExchangeSymbol(symbol));
    }

    const ticker = JSON.stringify({
      method: "subscribe",
      params: { channel: "ticker", symbol: symbols }
    });
    const book = JSON.stringify({
      method: "subscribe",
      params: { channel: "book", symbol: symbols, depth: this.maxLevels }
    });
    const messages = [ticker, book];
    return messages;
  }

  protected parseMessage(message: string): ProviderDataEvent[] {
    const events: ProviderDataEvent[] = [];
    const envelope = JSON.parse(message) as KrakenEnvelope;
    const channel = envelope.channel ?? "";
    const rows = (envelope.data ?? []) as Array<Record<string, unknown>>;
    const kind = envelope.type ?? "";
    const options: AppendKrakenEventsOptions = { events, channel, rows, kind };
    this.appendTickerEvents(options);
    this.appendBookEvents(options);

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
