/**
 * @section imports:internals
 */

import config from "../../config.ts";
import type { ClockService } from "../../shared/clock.service.ts";
import type { OrderBookMergerService } from "../../shared/order-book-merger.service.ts";
import { BaseProviderService, type WebSocketFactory } from "../shared/base-provider.service.ts";
import type { ProviderBaseOptions, ProviderDataEvent } from "../shared/provider.types.ts";
import type { CoinbaseEnvelope, CoinbaseLocalBook } from "./coinbase.types.ts";

/**
 * @section consts
 */

const COINBASE_WS_URL = config.providerUrls.coinbase;

/**
 * @section types
 */

type CoinbaseServiceOptions = {
  symbols: string[];
  maxLevels: number;
  clockService: ClockService;
  webSocketFactory: WebSocketFactory;
  providerOptions: ProviderBaseOptions;
  orderBookMergerService: OrderBookMergerService;
};

type ParsedDepthLevel = {
  price: number;
  size: number;
};

type AppendCoinbaseEventsOptions = {
  parsedEvents: ProviderDataEvent[];
  coinbaseEnvelope: CoinbaseEnvelope;
  eventType: string;
  symbol: string;
};

export class CoinbaseService extends BaseProviderService {
  /**
   * @section private:attributes
   */

  private readonly symbols: string[];
  private readonly maxLevels: number;
  private readonly orderBookMergerService: OrderBookMergerService;

  /**
   * @section private:properties
   */

  private readonly booksBySymbol: Map<string, CoinbaseLocalBook>;

  /**
   * @section constructor
   */

  public constructor(options: CoinbaseServiceOptions) {
    super({
      id: "coinbase",
      clockService: options.clockService,
      webSocketFactory: options.webSocketFactory,
      providerOptions: options.providerOptions,
    });
    this.symbols = options.symbols;
    this.maxLevels = options.maxLevels;
    this.orderBookMergerService = options.orderBookMergerService;
    this.booksBySymbol = new Map<string, CoinbaseLocalBook>();
  }

  /**
   * @section factory
   */

  public static create(options: CoinbaseServiceOptions): CoinbaseService {
    const service = new CoinbaseService(options);
    return service;
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

  private parseLevels(rawLevels: [string, string][]): ParsedDepthLevel[] {
    const parsedLevels: ParsedDepthLevel[] = [];

    for (const [rawPrice, rawSize] of rawLevels) {
      const price = Number(rawPrice);
      const size = Number(rawSize);
      const isValidLevel = Number.isFinite(price) && Number.isFinite(size);

      if (isValidLevel) {
        parsedLevels.push({ price, size });
      }
    }

    return parsedLevels;
  }

  private appendTickerEvents(options: AppendCoinbaseEventsOptions): void {
    const isTickerEvent = options.eventType === "ticker";

    if (isTickerEvent) {
      const ts = Number(new Date(options.coinbaseEnvelope.time ?? "").getTime());
      const price = Number(options.coinbaseEnvelope.price);
      const isValidEvent = options.symbol.length > 0 && Number.isFinite(ts) && Number.isFinite(price);

      if (isValidEvent) {
        options.parsedEvents.push({
          type: "price",
          provider: this.id,
          symbol: options.symbol,
          ts,
          price,
        });
      }
    }
  }

  private storeSnapshot(symbol: string, rawAsks: [string, string][], rawBids: [string, string][]): CoinbaseLocalBook {
    const asks = this.parseLevels(rawAsks).sort((leftLevel, rightLevel) => {
      const comparison = leftLevel.price - rightLevel.price;
      return comparison;
    });
    const bids = this.parseLevels(rawBids).sort((leftLevel, rightLevel) => {
      const comparison = rightLevel.price - leftLevel.price;
      return comparison;
    });
    const localBook: CoinbaseLocalBook = {
      symbol,
      asks: asks.slice(0, this.maxLevels),
      bids: bids.slice(0, this.maxLevels),
    };
    this.booksBySymbol.set(symbol, localBook);
    return localBook;
  }

  private applyChanges(symbol: string, changes: ["buy" | "sell", string, string][]): CoinbaseLocalBook | null {
    const currentBook = this.booksBySymbol.get(symbol) ?? null;
    let updatedBook: CoinbaseLocalBook | null = null;

    if (currentBook) {
      const deltaAsks: ParsedDepthLevel[] = [];
      const deltaBids: ParsedDepthLevel[] = [];

      for (const [side, rawPrice, rawSize] of changes) {
        const price = Number(rawPrice);
        const size = Number(rawSize);
        const isValidLevel = Number.isFinite(price) && Number.isFinite(size);

        if (isValidLevel) {
          if (side === "sell") {
            deltaAsks.push({ price, size });
          } else {
            deltaBids.push({ price, size });
          }
        }
      }

      const mergeResult = this.orderBookMergerService.merge({
        currentAsks: currentBook.asks,
        currentBids: currentBook.bids,
        deltaAsks,
        deltaBids,
        maxLevels: this.maxLevels,
      });
      updatedBook = {
        symbol,
        asks: mergeResult.asks,
        bids: mergeResult.bids,
      };
      this.booksBySymbol.set(symbol, updatedBook);
    }

    return updatedBook;
  }

  private appendSnapshotEvents(options: AppendCoinbaseEventsOptions): void {
    const isSnapshotEvent = options.eventType === "snapshot";

    if (isSnapshotEvent) {
      const rawAsks = options.coinbaseEnvelope.asks ?? [];
      const rawBids = options.coinbaseEnvelope.bids ?? [];
      const ts = Date.now();
      const localBook = this.storeSnapshot(options.symbol, rawAsks, rawBids);
      const isValidEvent = options.symbol.length > 0;

      if (isValidEvent) {
        options.parsedEvents.push({
          type: "orderbook",
          provider: this.id,
          symbol: options.symbol,
          ts,
          asks: localBook.asks,
          bids: localBook.bids,
        });
      }
    }
  }

  private appendUpdateEvents(options: AppendCoinbaseEventsOptions): void {
    const isUpdateEvent = options.eventType === "l2update";

    if (isUpdateEvent) {
      const changes = options.coinbaseEnvelope.changes ?? [];
      const ts = Number(new Date(options.coinbaseEnvelope.time ?? "").getTime());
      const localBook = this.applyChanges(options.symbol, changes);
      const isValidEvent = options.symbol.length > 0 && Number.isFinite(ts) && localBook !== null;

      if (isValidEvent && localBook) {
        options.parsedEvents.push({
          type: "orderbook",
          provider: this.id,
          symbol: options.symbol,
          ts,
          asks: localBook.asks,
          bids: localBook.bids,
        });
      }
    }
  }

  /**
   * @section protected:methods
   */

  protected getConnectionUrl(): string {
    const connectionUrl = COINBASE_WS_URL;
    return connectionUrl;
  }

  protected buildSubscriptionMessages(): string[] {
    const productIds: string[] = [];

    for (const symbol of this.symbols) {
      productIds.push(this.toProductId(symbol));
    }

    const subscriptionMessage = JSON.stringify({
      type: "subscribe",
      product_ids: productIds,
      channels: ["ticker", "level2_batch"],
    });
    const subscriptionMessages = [subscriptionMessage];
    return subscriptionMessages;
  }

  protected parseMessage(messageText: string): ProviderDataEvent[] {
    const parsedEvents: ProviderDataEvent[] = [];
    const coinbaseEnvelope = JSON.parse(messageText) as CoinbaseEnvelope;
    const eventType = coinbaseEnvelope.type ?? "";
    const productId = coinbaseEnvelope.product_id ?? "";
    const symbol = this.toSymbol(productId);
    const appendOptions: AppendCoinbaseEventsOptions = {
      parsedEvents,
      coinbaseEnvelope,
      eventType,
      symbol,
    };
    this.appendTickerEvents(appendOptions);
    this.appendSnapshotEvents(appendOptions);
    this.appendUpdateEvents(appendOptions);
    return parsedEvents;
  }
}
