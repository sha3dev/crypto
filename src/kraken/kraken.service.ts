/**
 * @section imports:internals
 */

import config from "../config.ts";
import type { OrderBookService } from "../order-book/order-book.service.ts";
import { ProviderService } from "../provider/provider.service.ts";
import type { WebSocketFactory } from "../provider/provider.service.ts";
import type { ProviderBaseOptions, ProviderDataEvent } from "../provider/provider.types.ts";
import type { ClockService } from "../time/clock.service.ts";
import type { KrakenEnvelope, KrakenLocalBook } from "./kraken.types.ts";

/**
 * @section consts
 */

const KRAKEN_WS_URL = config.providerUrls.kraken;

/**
 * @section types
 */

type KrakenServiceOptions = {
  symbols: string[];
  maxLevels: number;
  clockService: ClockService;
  webSocketFactory: WebSocketFactory;
  providerOptions: ProviderBaseOptions;
  orderBookService: OrderBookService;
};

type ParsedDepthLevel = {
  price: number;
  size: number;
};

type AppendKrakenEventsOptions = {
  parsedEvents: ProviderDataEvent[];
  channel: string;
  rows: Array<Record<string, unknown>>;
  kind: string;
};

const PROVIDER_SERVICE_CLASS = ProviderService;

export class KrakenService extends PROVIDER_SERVICE_CLASS {
  /**
   * @section private:attributes
   */

  private readonly symbols: string[];
  private readonly maxLevels: number;
  private readonly orderBookService: OrderBookService;

  /**
   * @section private:properties
   */

  private readonly booksBySymbol: Map<string, KrakenLocalBook>;

  /**
   * @section constructor
   */

  public constructor(options: KrakenServiceOptions) {
    super({
      id: "kraken",
      clockService: options.clockService,
      webSocketFactory: options.webSocketFactory,
      providerOptions: options.providerOptions,
    });
    this.symbols = options.symbols;
    this.maxLevels = options.maxLevels;
    this.orderBookService = options.orderBookService;
    this.booksBySymbol = new Map<string, KrakenLocalBook>();
  }

  /**
   * @section factory
   */

  public static create(options: KrakenServiceOptions): KrakenService {
    const service = new KrakenService(options);
    return service;
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

  private parseBookLevels(rawLevels: unknown[]): ParsedDepthLevel[] {
    const parsedLevels: ParsedDepthLevel[] = [];

    for (const rawLevel of rawLevels) {
      const levelEntry = rawLevel as { price?: number; qty?: number };
      const price = Number(levelEntry.price);
      const size = Number(levelEntry.qty);
      const isValidLevel = Number.isFinite(price) && Number.isFinite(size);

      if (isValidLevel) {
        parsedLevels.push({ price, size });
      }
    }

    return parsedLevels;
  }

  private saveSnapshot(symbol: string, rawAsks: unknown[], rawBids: unknown[]): KrakenLocalBook {
    const asks = this.parseBookLevels(rawAsks).sort((leftLevel, rightLevel) => leftLevel.price - rightLevel.price);
    const bids = this.parseBookLevels(rawBids).sort((leftLevel, rightLevel) => rightLevel.price - leftLevel.price);
    const localBook: KrakenLocalBook = { symbol, asks: asks.slice(0, this.maxLevels), bids: bids.slice(0, this.maxLevels) };
    this.booksBySymbol.set(symbol, localBook);
    return localBook;
  }

  private applyUpdate(symbol: string, rawAsks: unknown[], rawBids: unknown[]): KrakenLocalBook | null {
    const currentBook = this.booksBySymbol.get(symbol) ?? null;
    let updatedBook: KrakenLocalBook | null = null;

    if (currentBook !== null) {
      const deltaAsks = this.parseBookLevels(rawAsks);
      const deltaBids = this.parseBookLevels(rawBids);
      const mergeResult = this.orderBookService.merge({
        currentAsks: currentBook.asks,
        currentBids: currentBook.bids,
        deltaAsks,
        deltaBids,
        maxLevels: this.maxLevels,
      });
      updatedBook = { symbol, asks: mergeResult.asks, bids: mergeResult.bids };
      this.booksBySymbol.set(symbol, updatedBook);
    }

    return updatedBook;
  }

  private appendTickerEvents(options: AppendKrakenEventsOptions): void {
    const isTickerChannel = options.channel === "ticker";

    if (isTickerChannel) {
      for (const row of options.rows) {
        const symbol = this.toSymbol(String(row.symbol ?? ""));
        const ts = Number(new Date(String(row.timestamp ?? "")).getTime());
        const price = Number(row.last);
        const isValidEvent = symbol.length > 0 && Number.isFinite(ts) && Number.isFinite(price);

        if (isValidEvent) {
          options.parsedEvents.push({ type: "price", provider: this.id, symbol, ts, price });
        }
      }
    }
  }

  private appendBookEvents(options: AppendKrakenEventsOptions): void {
    const isBookChannel = options.channel === "book";

    if (isBookChannel) {
      for (const row of options.rows) {
        const symbol = this.toSymbol(String(row.symbol ?? ""));
        const ts = Number(new Date(String(row.timestamp ?? "")).getTime());
        const rawAsks = Array.isArray(row.asks) ? row.asks : [];
        const rawBids = Array.isArray(row.bids) ? row.bids : [];
        const localBook = options.kind === "snapshot" ? this.saveSnapshot(symbol, rawAsks, rawBids) : this.applyUpdate(symbol, rawAsks, rawBids);
        const isValidEvent = symbol.length > 0 && Number.isFinite(ts) && localBook !== null;

        if (isValidEvent && localBook !== null) {
          options.parsedEvents.push({ type: "orderbook", provider: this.id, symbol, ts, asks: localBook.asks, bids: localBook.bids });
        }
      }
    }
  }

  /**
   * @section protected:methods
   */

  protected getConnectionUrl(): string {
    const connectionUrl = KRAKEN_WS_URL;
    return connectionUrl;
  }

  protected buildSubscriptionMessages(): string[] {
    const exchangeSymbols: string[] = [];

    for (const symbol of this.symbols) {
      exchangeSymbols.push(this.toExchangeSymbol(symbol));
    }

    const tickerSubscription = JSON.stringify({ method: "subscribe", params: { channel: "ticker", symbol: exchangeSymbols } });
    const bookSubscription = JSON.stringify({ method: "subscribe", params: { channel: "book", symbol: exchangeSymbols, depth: this.maxLevels } });
    const subscriptionMessages = [tickerSubscription, bookSubscription];
    return subscriptionMessages;
  }

  protected parseMessage(messageText: string): ProviderDataEvent[] {
    const parsedEvents: ProviderDataEvent[] = [];
    const krakenEnvelope = JSON.parse(messageText) as KrakenEnvelope;
    const channel = krakenEnvelope.channel ?? "";
    const rows = (krakenEnvelope.data ?? []) as Array<Record<string, unknown>>;
    const kind = krakenEnvelope.type ?? "";
    const appendOptions: AppendKrakenEventsOptions = { parsedEvents, channel, rows, kind };
    this.appendTickerEvents(appendOptions);
    this.appendBookEvents(appendOptions);
    return parsedEvents;
  }
}
