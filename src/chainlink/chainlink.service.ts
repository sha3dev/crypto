/**
 * @section imports:internals
 */

import config from "../config.ts";
import { ProviderService } from "../provider/provider.service.ts";
import type { WebSocketFactory } from "../provider/provider.service.ts";
import type { ProviderBaseOptions, ProviderDataEvent } from "../provider/provider.types.ts";
import type { ClockService } from "../time/clock.service.ts";
import type { ChainlinkEnvelope } from "./chainlink.types.ts";

/**
 * @section consts
 */

const CHAINLINK_WS_URL = config.providerUrls.chainlink;
const CHAINLINK_TOPIC = config.chainlink.topic;
const CHAINLINK_PING_MESSAGE = "PING";
const CHAINLINK_PONG_MESSAGE = "PONG";
const CHAINLINK_PING_INTERVAL_MS = 5_000;

/**
 * @section types
 */

type ChainlinkServiceOptions = {
  symbols: string[];
  clockService: ClockService;
  webSocketFactory: WebSocketFactory;
  providerOptions: ProviderBaseOptions;
};

const PROVIDER_SERVICE_CLASS = ProviderService;

export class ChainlinkService extends PROVIDER_SERVICE_CLASS {
  /**
   * @section private:attributes
   */

  private readonly symbols: Set<string>;

  /**
   * @section private:properties
   */

  private pingInterval: NodeJS.Timeout | null;

  /**
   * @section constructor
   */

  public constructor(options: ChainlinkServiceOptions) {
    super({
      id: "chainlink",
      clockService: options.clockService,
      webSocketFactory: options.webSocketFactory,
      providerOptions: options.providerOptions,
    });
    this.symbols = this.normalizeConfiguredSymbols(options.symbols);
    this.pingInterval = null;
  }

  /**
   * @section factory
   */

  public static create(options: ChainlinkServiceOptions): ChainlinkService {
    const service = new ChainlinkService(options);
    return service;
  }

  /**
   * @section private:methods
   */

  private toBaseSymbol(symbolInput: string): string {
    const normalizedInput = symbolInput.trim().toLowerCase();
    const symbol = normalizedInput.split(/[/:_-]/)[0] ?? "";
    return symbol;
  }

  private normalizeConfiguredSymbols(symbols: string[]): Set<string> {
    const normalizedSymbols = new Set<string>();

    for (const symbolInput of symbols) {
      const symbol = this.toBaseSymbol(symbolInput);

      if (symbol.length > 0) {
        normalizedSymbols.add(symbol);
      }
    }

    return normalizedSymbols;
  }

  private shouldIncludeSymbol(symbolInput: string): boolean {
    const symbol = this.toBaseSymbol(symbolInput);
    const shouldInclude = this.symbols.has(symbol);
    return shouldInclude;
  }

  private shouldIgnoreControlMessage(messageText: string): boolean {
    const normalizedMessage = messageText.trim().toUpperCase();
    const isEmptyMessage = normalizedMessage.length === 0;
    const isPongMessage = normalizedMessage === CHAINLINK_PONG_MESSAGE;
    const isPingMessage = normalizedMessage === CHAINLINK_PING_MESSAGE;
    const shouldIgnore = isEmptyMessage || isPongMessage || isPingMessage;
    return shouldIgnore;
  }

  private parseEnvelope(chainlinkEnvelope: ChainlinkEnvelope): ProviderDataEvent[] {
    const parsedEvents: ProviderDataEvent[] = [];
    const topic = chainlinkEnvelope.topic ?? "";
    const eventType = chainlinkEnvelope.type ?? "";
    const isUpdateEnvelope = topic === CHAINLINK_TOPIC && eventType === "update";

    if (isUpdateEnvelope) {
      const rawSymbol = chainlinkEnvelope.payload?.symbol ?? "";
      const symbol = this.toBaseSymbol(rawSymbol);
      const ts = Number(chainlinkEnvelope.payload?.timestamp ?? chainlinkEnvelope.timestamp);
      const price = Number(chainlinkEnvelope.payload?.value);
      const isValidEvent = this.shouldIncludeSymbol(symbol) && Number.isFinite(ts) && Number.isFinite(price);

      if (isValidEvent) {
        parsedEvents.push({ type: "price", provider: this.id, symbol, ts, price });
      }
    }

    return parsedEvents;
  }

  private clearPingInterval(): void {
    if (this.pingInterval !== null) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }

  private startPingInterval(): void {
    this.clearPingInterval();
    this.pingInterval = setInterval(() => {
      this.sendSocketMessage(CHAINLINK_PING_MESSAGE);
    }, CHAINLINK_PING_INTERVAL_MS);
  }

  /**
   * @section protected:methods
   */

  protected getConnectionUrl(): string {
    const connectionUrl = CHAINLINK_WS_URL;
    return connectionUrl;
  }

  protected buildSubscriptionMessages(): string[] {
    const subscriptionMessage = JSON.stringify({
      action: "subscribe",
      subscriptions: [{ topic: CHAINLINK_TOPIC, type: "*" }],
    });
    const subscriptionMessages = [subscriptionMessage];
    return subscriptionMessages;
  }

  protected parseMessage(messageText: string): ProviderDataEvent[] {
    const parsedEvents: ProviderDataEvent[] = [];
    const shouldIgnoreMessage = this.shouldIgnoreControlMessage(messageText);

    if (!shouldIgnoreMessage) {
      const decodedEnvelope = JSON.parse(messageText) as ChainlinkEnvelope | ChainlinkEnvelope[];
      const envelopes = Array.isArray(decodedEnvelope) ? decodedEnvelope : [decodedEnvelope];

      for (const chainlinkEnvelope of envelopes) {
        const envelopeEvents = this.parseEnvelope(chainlinkEnvelope);

        for (const parsedEvent of envelopeEvents) {
          parsedEvents.push(parsedEvent);
        }
      }
    }

    return parsedEvents;
  }

  protected onSocketConnected(): void {
    this.startPingInterval();
  }

  protected onSocketDisconnected(): void {
    this.clearPingInterval();
  }
}
