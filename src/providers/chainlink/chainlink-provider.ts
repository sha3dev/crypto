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
import type { ChainlinkEnvelope } from "./chainlink-types.js";

/**
 * @section consts
 */

const CHAINLINK_WS_URL = CONFIG.providerUrls.chainlink;
const CHAINLINK_TOPIC = CONFIG.chainlink.topic;

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

  public constructor(options: ChainlinkProviderOptions) {
    super({
      id: "chainlink",
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

  public static create(options: ChainlinkProviderOptions): ChainlinkProvider {
    const provider = new ChainlinkProvider(options);
    return provider;
  }

  /**
   * @section private:methods
   */

  private toSymbol(rawSymbol: string): string {
    const symbol = rawSymbol.split("/")[0]?.toLowerCase() ?? "";
    return symbol;
  }

  private shouldIncludeSymbol(symbol: string): boolean {
    let include = false;

    for (const allowedSymbol of this.symbols) {
      if (allowedSymbol === symbol) {
        include = true;
      }
    }

    return include;
  }

  private parseEnvelope(envelope: ChainlinkEnvelope): ProviderDataEvent[] {
    const events: ProviderDataEvent[] = [];
    const topic = envelope.topic ?? "";
    const eventType = envelope.type ?? "";

    if (topic === CHAINLINK_TOPIC && eventType === "update") {
      const rawSymbol = envelope.payload?.symbol ?? "";
      const symbol = this.toSymbol(rawSymbol);
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

  /**
   * @section protected:methods
   */

  // empty

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
    const raw = JSON.parse(message) as ChainlinkEnvelope | ChainlinkEnvelope[];
    const envelopes = Array.isArray(raw) ? raw : [raw];

    for (const envelope of envelopes) {
      const parsed = this.parseEnvelope(envelope);

      for (const event of parsed) {
        events.push(event);
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
