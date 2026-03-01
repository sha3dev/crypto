/**
 * @section imports:externals
 */

// empty

/**
 * @section imports:internals
 */

import type { OrderBookMerger } from "../../shared/order-book-merger.js";
import type { TimeUtils } from "../../shared/time-utils.js";
import CONFIG from "../../config.js";
import { BaseProvider, type WebSocketFactory } from "../shared/base-provider.js";
import type { ProviderBaseOptions, ProviderDataEvent } from "../shared/provider-types.js";
import type { CoinbaseEnvelope, CoinbaseLocalBook } from "./coinbase-types.js";

/**
 * @section consts
 */

const COINBASE_WS_URL = CONFIG.providerUrls.coinbase;

/**
 * @section types
 */

type CoinbaseProviderOptions = {
  symbols: string[];
  maxLevels: number;
  timeUtils: TimeUtils;
  wsFactory: WebSocketFactory;
  providerOptions: ProviderBaseOptions;
  bookMerger: OrderBookMerger;
};

export class CoinbaseProvider extends BaseProvider {
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

  private readonly booksBySymbol: Map<string, CoinbaseLocalBook>;

  /**
   * @section public:properties
   */

  // empty

  /**
   * @section constructor
   */

  public constructor(options: CoinbaseProviderOptions) {
    super({
      id: "coinbase",
      timeUtils: options.timeUtils,
      wsFactory: options.wsFactory,
      providerOptions: options.providerOptions
    });
    this.symbols = options.symbols;
    this.maxLevels = options.maxLevels;
    this.bookMerger = options.bookMerger;
    this.booksBySymbol = new Map<string, CoinbaseLocalBook>();
  }

  /**
   * @section static:properties
   */

  // empty

  /**
   * @section factory
   */

  public static create(options: CoinbaseProviderOptions): CoinbaseProvider {
    const provider = new CoinbaseProvider(options);
    return provider;
  }

  /**
   * @section private:methods
   */

  private toProductId(symbol: string): string {
    const productId = `${symbol.toUpperCase()}-USD`;
    return productId;
  }

  private toSymbol(productId: string): string {
    const symbol = productId.split("-")[0]?.toLowerCase() ?? "";
    return symbol;
  }

  private parseLevels(rawLevels: [string, string][]): { price: number; size: number }[] {
    const levels: { price: number; size: number }[] = [];

    for (const [rawPrice, rawSize] of rawLevels) {
      const price = Number(rawPrice);
      const size = Number(rawSize);

      if (Number.isFinite(price) && Number.isFinite(size)) {
        levels.push({ price, size });
      }
    }

    return levels;
  }

  private updateFromSnapshot(
    symbol: string,
    rawAsks: [string, string][],
    rawBids: [string, string][]
  ): CoinbaseLocalBook {
    const asks = this.parseLevels(rawAsks).sort((left, right) => {
      const comparison = left.price - right.price;
      return comparison;
    });
    const bids = this.parseLevels(rawBids).sort((left, right) => {
      const comparison = right.price - left.price;
      return comparison;
    });
    const localBook: CoinbaseLocalBook = {
      symbol,
      asks: asks.slice(0, this.maxLevels),
      bids: bids.slice(0, this.maxLevels)
    };
    this.booksBySymbol.set(symbol, localBook);
    return localBook;
  }

  private updateFromDelta(
    symbol: string,
    changes: ["buy" | "sell", string, string][]
  ): CoinbaseLocalBook | null {
    const currentBook = this.booksBySymbol.get(symbol) ?? null;
    let updatedBook: CoinbaseLocalBook | null = null;

    if (currentBook) {
      const deltaAsks: { price: number; size: number }[] = [];
      const deltaBids: { price: number; size: number }[] = [];

      for (const [side, rawPrice, rawSize] of changes) {
        const price = Number(rawPrice);
        const size = Number(rawSize);

        if (Number.isFinite(price) && Number.isFinite(size)) {
          if (side === "sell") {
            deltaAsks.push({ price, size });
          } else {
            deltaBids.push({ price, size });
          }
        }
      }

      const merged = this.bookMerger.merge({
        currentAsks: currentBook.asks,
        currentBids: currentBook.bids,
        deltaAsks,
        deltaBids,
        maxLevels: this.maxLevels
      });
      updatedBook = { symbol, asks: merged.asks, bids: merged.bids };
      this.booksBySymbol.set(symbol, updatedBook);
    }

    return updatedBook;
  }

  /**
   * @section protected:methods
   */

  // empty

  protected getConnectionUrl(): string {
    const url = COINBASE_WS_URL;
    return url;
  }

  protected buildSubscriptionMessages(): string[] {
    const productIds: string[] = [];

    for (const symbol of this.symbols) {
      productIds.push(this.toProductId(symbol));
    }

    const message = JSON.stringify({
      type: "subscribe",
      product_ids: productIds,
      channels: ["ticker", "level2_batch"]
    });
    const messages = [message];
    return messages;
  }

  protected parseMessage(message: string): ProviderDataEvent[] {
    const events: ProviderDataEvent[] = [];
    const envelope = JSON.parse(message) as CoinbaseEnvelope;
    const eventType = envelope.type ?? "";
    const productId = envelope.product_id ?? "";
    const symbol = this.toSymbol(productId);

    if (eventType === "ticker") {
      const ts = Number(new Date(envelope.time ?? "").getTime());
      const price = Number(envelope.price);
      const isValid = symbol.length > 0 && Number.isFinite(ts) && Number.isFinite(price);

      if (isValid) {
        events.push({ type: "price", provider: this.id, symbol, ts, price });
      }
    }

    if (eventType === "snapshot") {
      const asks = envelope.asks ?? [];
      const bids = envelope.bids ?? [];
      const ts = Date.now();
      const book = this.updateFromSnapshot(symbol, asks, bids);
      const isValid = symbol.length > 0;

      if (isValid) {
        events.push({
          type: "orderbook",
          provider: this.id,
          symbol,
          ts,
          asks: book.asks,
          bids: book.bids
        });
      }
    }

    if (eventType === "l2update") {
      const changes = envelope.changes ?? [];
      const ts = Number(new Date(envelope.time ?? "").getTime());
      const book = this.updateFromDelta(symbol, changes);
      const isValid = symbol.length > 0 && Number.isFinite(ts) && Boolean(book);

      if (isValid && book) {
        events.push({
          type: "orderbook",
          provider: this.id,
          symbol,
          ts,
          asks: book.asks,
          bids: book.bids
        });
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
