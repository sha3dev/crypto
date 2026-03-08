/**
 * @section imports:internals
 */

import config from "../../config.ts";
import type { ClockService } from "../../shared/clock.service.ts";
import { BaseProviderService, type WebSocketFactory } from "../shared/base-provider.service.ts";
import type { ProviderBaseOptions, ProviderDataEvent } from "../shared/provider.types.ts";
import type { OkxEnvelope } from "./okx.types.ts";

/**
 * @section consts
 */

const OKX_WS_URL = config.providerUrls.okx;

/**
 * @section types
 */

type OkxServiceOptions = {
  symbols: string[];
  maxLevels: number;
  clockService: ClockService;
  webSocketFactory: WebSocketFactory;
  providerOptions: ProviderBaseOptions;
};

type ParsedDepthLevel = {
  price: number;
  size: number;
};

type AppendOkxEventsOptions = {
  parsedEvents: ProviderDataEvent[];
  channel: string;
  symbol: string;
  rows: Array<Record<string, unknown>>;
};

export class OkxService extends BaseProviderService {
  /**
   * @section private:attributes
   */

  private readonly symbols: string[];
  private readonly maxLevels: number;

  /**
   * @section constructor
   */

  public constructor(options: OkxServiceOptions) {
    super({
      id: "okx",
      clockService: options.clockService,
      webSocketFactory: options.webSocketFactory,
      providerOptions: options.providerOptions,
    });
    this.symbols = options.symbols;
    this.maxLevels = options.maxLevels;
  }

  /**
   * @section factory
   */

  public static create(options: OkxServiceOptions): OkxService {
    const service = new OkxService(options);
    return service;
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

  private parseDepthSide(rawLevels: unknown[]): ParsedDepthLevel[] {
    const parsedLevels: ParsedDepthLevel[] = [];

    for (const rawLevel of rawLevels) {
      const levelEntry = rawLevel as [string, string];
      const price = Number(levelEntry[0]);
      const size = Number(levelEntry[1]);
      const isValidLevel = Number.isFinite(price) && Number.isFinite(size);

      if (isValidLevel) {
        parsedLevels.push({ price, size });
      }
    }

    return parsedLevels;
  }

  private appendTickerEvents(options: AppendOkxEventsOptions): void {
    const isTickerChannel = options.channel === "tickers";

    if (isTickerChannel) {
      for (const row of options.rows) {
        const ts = Number(row.ts);
        const price = Number(row.last);
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
  }

  private appendBookEvents(options: AppendOkxEventsOptions): void {
    const isBookChannel = options.channel === "books5";

    if (isBookChannel) {
      for (const row of options.rows) {
        const ts = Number(row.ts);
        const rawAsks = Array.isArray(row.asks) ? row.asks : [];
        const rawBids = Array.isArray(row.bids) ? row.bids : [];
        const asks = this.parseDepthSide(rawAsks).sort((leftLevel, rightLevel) => {
          const comparison = leftLevel.price - rightLevel.price;
          return comparison;
        });
        const bids = this.parseDepthSide(rawBids).sort((leftLevel, rightLevel) => {
          const comparison = rightLevel.price - leftLevel.price;
          return comparison;
        });
        const isValidEvent = options.symbol.length > 0 && Number.isFinite(ts);

        if (isValidEvent) {
          options.parsedEvents.push({
            type: "orderbook",
            provider: this.id,
            symbol: options.symbol,
            ts,
            asks: asks.slice(0, this.maxLevels),
            bids: bids.slice(0, this.maxLevels),
          });
        }
      }
    }
  }

  /**
   * @section protected:methods
   */

  protected getConnectionUrl(): string {
    const connectionUrl = OKX_WS_URL;
    return connectionUrl;
  }

  protected buildSubscriptionMessages(): string[] {
    const tickerArgs: { channel: string; instId: string }[] = [];
    const bookArgs: { channel: string; instId: string }[] = [];

    for (const symbol of this.symbols) {
      const instId = this.toExchangeSymbol(symbol);
      tickerArgs.push({ channel: "tickers", instId });
      bookArgs.push({ channel: "books5", instId });
    }

    const tickerSubscription = JSON.stringify({ op: "subscribe", args: tickerArgs });
    const bookSubscription = JSON.stringify({ op: "subscribe", args: bookArgs });
    const subscriptionMessages = [tickerSubscription, bookSubscription];
    return subscriptionMessages;
  }

  protected parseMessage(messageText: string): ProviderDataEvent[] {
    const parsedEvents: ProviderDataEvent[] = [];
    const okxEnvelope = JSON.parse(messageText) as OkxEnvelope;
    const channel = okxEnvelope.arg?.channel ?? "";
    const instId = okxEnvelope.arg?.instId ?? "";
    const symbol = this.toSymbol(instId);
    const rows = (okxEnvelope.data ?? []) as Array<Record<string, unknown>>;
    const appendOptions: AppendOkxEventsOptions = { parsedEvents, channel, symbol, rows };
    this.appendTickerEvents(appendOptions);
    this.appendBookEvents(appendOptions);
    return parsedEvents;
  }
}
