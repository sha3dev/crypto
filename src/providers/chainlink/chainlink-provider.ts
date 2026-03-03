/**
 * @section imports:externals
 */

// empty

/**
 * @section imports:internals
 */

import type { TimeUtils } from "../../shared/time-utils.js";
import CONFIG from "../../config.ts";
import { BaseProvider, type WebSocketFactory } from "../shared/base-provider.js";
import type { ProviderBaseOptions, ProviderDataEvent } from "../shared/provider-types.js";
import type { ChainlinkEnvelope } from "./chainlink-types.js";

/**
 * @section consts
 */

const CHAINLINK_WS_URL = CONFIG.providerUrls.chainlink;
const CHAINLINK_TOPIC = CONFIG.chainlink.topic;
const CHAINLINK_PING_MESSAGE = "PING";
const CHAINLINK_PONG_MESSAGE = "PONG";
const CHAINLINK_PING_INTERVAL_MS = 5_000;

/**
 * @section types
 */

type ChainlinkProviderOptions = {
  symbols: string[];
  timeUtils: TimeUtils;
  wsFactory: WebSocketFactory;
  providerOptions: ProviderBaseOptions;
};

export class ChainlinkProvider extends BaseProvider {
  /**
   * @section private:attributes
   */

  private readonly symbols: Set<string>;

  /**
   * @section protected:attributes
   */

  // empty

  /**
   * @section private:properties
   */

  private pingInterval: NodeJS.Timeout | null;

  /**
   * @section public:properties
   */

  // empty

  /**
   * @section constructor
   */

  public constructor(options: ChainlinkProviderOptions) {
    super({
      id: "chainlink",
      timeUtils: options.timeUtils,
      wsFactory: options.wsFactory,
      providerOptions: options.providerOptions
    });
    this.symbols = this.normalizeConfiguredSymbols(options.symbols);
    this.pingInterval = null;
  }

  /**
   * @section static:properties
   */

  // empty

  /**
   * @section factory
   */

  public static create(options: ChainlinkProviderOptions): ChainlinkProvider {
    const provider = new ChainlinkProvider(options);
    return provider;
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
    let include = false;

    if (this.symbols.has(symbol)) {
      include = true;
    }

    return include;
  }

  private parseEnvelope(envelope: ChainlinkEnvelope): ProviderDataEvent[] {
    const events: ProviderDataEvent[] = [];
    const topic = envelope.topic ?? "";
    const eventType = envelope.type ?? "";

    if (topic === CHAINLINK_TOPIC && eventType === "update") {
      const rawSymbol = envelope.payload?.symbol ?? "";
      const symbol = this.toBaseSymbol(rawSymbol);
      const ts = Number(envelope.payload?.timestamp ?? envelope.timestamp);
      const price = Number(envelope.payload?.value);
      const isValid =
        this.shouldIncludeSymbol(symbol) && Number.isFinite(ts) && Number.isFinite(price);

      if (isValid) {
        events.push({ type: "price", provider: this.id, symbol, ts, price });
      }
    }

    return events;
  }

  private clearPingInterval(): void {
    if (this.pingInterval) {
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
    const url = CHAINLINK_WS_URL;
    return url;
  }

  protected buildSubscriptionMessages(): string[] {
    const subscription = JSON.stringify({
      action: "subscribe",
      subscriptions: [{ topic: CHAINLINK_TOPIC, type: "*" }]
    });
    const messages = [subscription];
    return messages;
  }

  protected parseMessage(message: string): ProviderDataEvent[] {
    const events: ProviderDataEvent[] = [];
    const normalizedMessage = message.trim().toUpperCase();

    if (normalizedMessage !== CHAINLINK_PONG_MESSAGE) {
      const raw = JSON.parse(message) as ChainlinkEnvelope | ChainlinkEnvelope[];
      const envelopes = Array.isArray(raw) ? raw : [raw];

      for (const envelope of envelopes) {
        const parsed = this.parseEnvelope(envelope);

        for (const event of parsed) {
          events.push(event);
        }
      }
    }

    return events;
  }

  protected onSocketConnected(): void {
    this.startPingInterval();
  }

  protected onSocketDisconnected(): void {
    this.clearPingInterval();
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
