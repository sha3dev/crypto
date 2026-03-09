/**
 * @section imports:internals
 */

import config from "../config.ts";
import { ProviderService } from "../provider/provider.service.ts";
import type { WebSocketFactory } from "../provider/provider.service.ts";
import type { ProviderBaseOptions, ProviderDataEvent } from "../provider/provider.types.ts";
import type { ClockService } from "../time/clock.service.ts";
import type { BinanceAggTradeEnvelope, BinanceDepthEnvelope, BinanceStreamEnvelope } from "./binance.types.ts";

/**
 * @section consts
 */

const BINANCE_WS_URL = config.providerUrls.binance;

/**
 * @section types
 */

type BinanceServiceOptions = {
  symbols: string[];
  clockService: ClockService;
  webSocketFactory: WebSocketFactory;
  providerOptions: ProviderBaseOptions;
};

type ParsedDepthLevel = {
  price: number;
  size: number;
};

type AppendBinanceEventsOptions = {
  streamName: string;
  envelopePayload: unknown;
  parsedEvents: ProviderDataEvent[];
};

const PROVIDER_SERVICE_CLASS = ProviderService;

export class BinanceService extends PROVIDER_SERVICE_CLASS {
  /**
   * @section private:attributes
   */

  private readonly symbols: string[];

  /**
   * @section constructor
   */

  public constructor(options: BinanceServiceOptions) {
    super({
      id: "binance",
      clockService: options.clockService,
      webSocketFactory: options.webSocketFactory,
      providerOptions: options.providerOptions,
    });
    this.symbols = options.symbols;
  }

  /**
   * @section factory
   */

  public static create(options: BinanceServiceOptions): BinanceService {
    const service = new BinanceService(options);
    return service;
  }

  /**
   * @section private:methods
   */

  private toPair(symbol: string): string {
    const pair = `${symbol.toLowerCase()}usdt`;
    return pair;
  }

  private toSymbol(streamName: string): string {
    const pair = streamName.split("@")[0] ?? "";
    const symbol = pair.slice(0, 3).toLowerCase();
    return symbol;
  }

  private parseDepthLevels(rawLevels: [string, string][]): ParsedDepthLevel[] {
    const parsedLevels: ParsedDepthLevel[] = [];

    for (const rawLevel of rawLevels) {
      const price = Number(rawLevel[0]);
      const size = Number(rawLevel[1]);
      const isValidLevel = Number.isFinite(price) && Number.isFinite(size);

      if (isValidLevel) {
        parsedLevels.push({ price, size });
      }
    }

    return parsedLevels;
  }

  private appendAggTradeEvents(options: AppendBinanceEventsOptions): void {
    const isAggTradeStream = options.streamName.includes("@aggTrade");

    if (isAggTradeStream) {
      const tradeEnvelope = options.envelopePayload as BinanceAggTradeEnvelope;
      const symbol = this.toSymbol(options.streamName);
      const ts = Number(tradeEnvelope.E);
      const price = Number(tradeEnvelope.p);
      const size = Number(tradeEnvelope.q);
      const buyerIsMaker = Boolean(tradeEnvelope.m);
      const isValidEvent = symbol.length > 0 && Number.isFinite(ts) && Number.isFinite(price) && Number.isFinite(size);

      if (isValidEvent) {
        options.parsedEvents.push({ type: "price", provider: this.id, symbol, ts, price });
        options.parsedEvents.push({ type: "trade", provider: this.id, symbol, ts, price, size, buyerIsMaker });
      }
    }
  }

  private appendDepthEvents(options: AppendBinanceEventsOptions): void {
    const isDepthStream = options.streamName.includes("@depth");

    if (isDepthStream) {
      const depthEnvelope = options.envelopePayload as BinanceDepthEnvelope;
      const rawAsks = depthEnvelope.asks ?? depthEnvelope.a ?? [];
      const rawBids = depthEnvelope.bids ?? depthEnvelope.b ?? [];
      const symbol = this.toSymbol(options.streamName);
      const ts = Number(depthEnvelope.E ?? Date.now());
      const asks = this.parseDepthLevels(rawAsks).sort((leftLevel, rightLevel) => leftLevel.price - rightLevel.price);
      const bids = this.parseDepthLevels(rawBids).sort((leftLevel, rightLevel) => rightLevel.price - leftLevel.price);
      const isValidEvent = symbol.length > 0 && Number.isFinite(ts);

      if (isValidEvent) {
        options.parsedEvents.push({ type: "orderbook", provider: this.id, symbol, ts, asks, bids });
      }
    }
  }

  /**
   * @section protected:methods
   */

  protected getConnectionUrl(): string {
    const streamNames: string[] = [];

    for (const symbol of this.symbols) {
      const pair = this.toPair(symbol);
      streamNames.push(`${pair}@aggTrade`);
      streamNames.push(`${pair}@depth5@100ms`);
    }

    const connectionUrl = `${BINANCE_WS_URL}?streams=${streamNames.join("/")}`;
    return connectionUrl;
  }

  protected buildSubscriptionMessages(): string[] {
    const subscriptionMessages: string[] = [];
    return subscriptionMessages;
  }

  protected parseMessage(messageText: string): ProviderDataEvent[] {
    const parsedEvents: ProviderDataEvent[] = [];
    const streamEnvelope = JSON.parse(messageText) as BinanceStreamEnvelope;
    const streamName = streamEnvelope.stream ?? "";
    const appendOptions: AppendBinanceEventsOptions = { streamName, envelopePayload: streamEnvelope.data, parsedEvents };
    this.appendAggTradeEvents(appendOptions);
    this.appendDepthEvents(appendOptions);
    return parsedEvents;
  }
}
