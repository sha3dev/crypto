/**
 * @section imports:externals
 */

import WebSocket, { type RawData } from "ws";

/**
 * @section imports:internals
 */

import type { TimeUtils } from "../../shared/time-utils.js";
import { ProviderConnectionError } from "./provider-connection-error.js";
import { ProviderParseError } from "./provider-parse-error.js";
import type { ProviderConnectionStatus } from "./provider-status.js";
import type {
  FeedEvent,
  ProviderBaseOptions,
  ProviderContract,
  ProviderDataEvent,
  ProviderEventListener
} from "./provider-types.js";

/**
 * @section consts
 */

const CLOSE_REASON_MANUAL_DISCONNECT = "manual-disconnect";

/**
 * @section types
 */

export type WebSocketFactory = (url: string) => WebSocket;

type OpenResult = { connected: boolean; reason: string };
type OpenResultResolver = (result: OpenResult) => void;
type BaseProviderConstructorOptions = {
  id: ProviderContract["id"];
  timeUtils: TimeUtils;
  wsFactory: WebSocketFactory;
  providerOptions: ProviderBaseOptions;
};

export abstract class BaseProvider implements ProviderContract {
  /**
   * @section private:attributes
   */

  public readonly id: ProviderContract["id"];

  /**
   * @section protected:attributes
   */

  // empty

  /**
   * @section private:properties
   */

  private readonly timeUtils: TimeUtils;
  private readonly wsFactory: WebSocketFactory;
  private readonly options: ProviderBaseOptions;
  private listener: ProviderEventListener | null;
  private socket: WebSocket | null;
  private reconnectTimeout: NodeJS.Timeout | null;
  private reconnectAttempt: number;
  private manualDisconnect: boolean;

  /**
   * @section public:properties
   */

  // empty

  /**
   * @section constructor
   */

  public constructor(options: BaseProviderConstructorOptions) {
    this.id = options.id;
    this.timeUtils = options.timeUtils;
    this.wsFactory = options.wsFactory;
    this.options = options.providerOptions;
    this.listener = null;
    this.socket = null;
    this.reconnectTimeout = null;
    this.reconnectAttempt = 0;
    this.manualDisconnect = false;
  }

  /**
   * @section static:properties
   */

  // empty

  /**
   * @section factory
   */

  // empty

  /**
   * @section private:methods
   */

  private emit(event: FeedEvent): void {
    if (this.listener) {
      this.listener(event);
    }
  }

  private emitStatus(status: ProviderConnectionStatus, message: string): void {
    const event: FeedEvent = {
      type: "status",
      provider: this.id,
      ts: this.timeUtils.now(),
      status,
      message
    };
    this.emit(event);
  }

  private clearReconnectTimeout(): void {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
  }

  private getReconnectDelayMs(): number {
    this.reconnectAttempt += 1;
    const baseDelay = this.options.reconnectBaseDelayMs * 2 ** (this.reconnectAttempt - 1);
    const cappedBaseDelay = Math.min(baseDelay, this.options.reconnectMaxDelayMs);
    const jitterRange = Math.round(cappedBaseDelay * this.options.reconnectJitterRatio);
    const jitter = Math.round(Math.random() * jitterRange);
    const waitMs = cappedBaseDelay + jitter;
    return waitMs;
  }

  private scheduleReconnect(): void {
    if (!this.reconnectTimeout) {
      const waitMs = this.getReconnectDelayMs();
      this.emitStatus("reconnecting", `reconnecting in ${waitMs}ms`);
      this.reconnectTimeout = setTimeout(() => {
        this.reconnectTimeout = null;
        void this.reconnect();
      }, waitMs);
    }
  }

  private async reconnect(): Promise<void> {
    let reason = "unknown";

    if (!this.manualDisconnect) {
      const result = await this.openSocket();
      reason = result.reason;

      if (!result.connected) {
        this.emitStatus("error", `reconnect failed: ${reason}`);
        this.scheduleReconnect();
      }
    }
  }

  private decodeRawMessage(data: RawData): string {
    let text = "";

    if (typeof data === "string") {
      text = data;
    } else if (Buffer.isBuffer(data)) {
      text = data.toString("utf8");
    } else if (Array.isArray(data)) {
      const chunks = Buffer.concat(data);
      text = chunks.toString("utf8");
    } else {
      text = Buffer.from(data).toString("utf8");
    }

    return text;
  }

  private closeActiveSocket(): void {
    if (this.socket) {
      const socket = this.socket;
      this.socket = null;
      socket.removeAllListeners();
      socket.close();
    }
  }

  private attachOpenListener(socket: WebSocket, settle: OpenResultResolver): void {
    socket.on("open", () => {
      this.reconnectAttempt = 0;
      this.emitStatus("connected", "socket connected");
      this.sendSubscriptionMessages();
      settle({ connected: true, reason: "connected" });
    });
  }

  private attachMessageListener(socket: WebSocket): void {
    socket.on("message", (rawData: RawData) => {
      const text = this.decodeRawMessage(rawData);
      this.handleRawMessage(text);
    });
  }

  private attachErrorListener(socket: WebSocket, settle: OpenResultResolver): void {
    socket.on("error", (error: Error) => {
      const reason = error instanceof Error ? error.message : "unknown socket error";
      this.emitStatus("error", reason);
      settle({ connected: false, reason });
    });
  }

  private attachCloseListener(socket: WebSocket, settle: OpenResultResolver): void {
    socket.on("close", (_code: number, reasonBuffer: Buffer) => {
      const reasonText = Buffer.isBuffer(reasonBuffer)
        ? reasonBuffer.toString("utf8")
        : String(reasonBuffer ?? "");
      const closeReason = reasonText || CLOSE_REASON_MANUAL_DISCONNECT;
      this.emitStatus("disconnected", closeReason);

      if (!this.manualDisconnect) {
        this.scheduleReconnect();
      }

      settle({ connected: false, reason: closeReason });
    });
  }

  private attachSocketListeners(socket: WebSocket, resolve: OpenResultResolver): void {
    let isSettled = false;

    const settle = (result: OpenResult): void => {
      if (!isSettled) {
        isSettled = true;
        resolve(result);
      }
    };
    this.attachOpenListener(socket, settle);
    this.attachMessageListener(socket);
    this.attachErrorListener(socket, settle);
    this.attachCloseListener(socket, settle);
  }

  private async openSocket(): Promise<OpenResult> {
    let result: OpenResult = { connected: false, reason: "initial-state" };

    this.closeActiveSocket();
    const socket = this.wsFactory(this.getConnectionUrl());
    this.socket = socket;

    const connectPromise = new Promise<OpenResult>((resolve) => {
      const timer = setTimeout(() => {
        const timeoutResult: OpenResult = { connected: false, reason: "connection timeout" };
        resolve(timeoutResult);
      }, this.options.connectTimeoutMs);

      this.attachSocketListeners(socket, (openResult) => {
        clearTimeout(timer);
        resolve(openResult);
      });
    });

    result = await connectPromise;

    if (!result.connected) {
      this.closeActiveSocket();
    }

    return result;
  }

  /**
   * @section protected:methods
   */

  protected sendSubscriptionMessages(): void {
    const messages = this.buildSubscriptionMessages();

    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      for (const message of messages) {
        this.socket.send(message);
      }
    }
  }

  protected abstract getConnectionUrl(): string;

  protected abstract buildSubscriptionMessages(): string[];

  protected abstract parseMessage(message: string): ProviderDataEvent[];

  /**
   * @section public:methods
   */

  public async connect(listener: ProviderEventListener): Promise<void> {
    this.listener = listener;
    this.manualDisconnect = false;
    this.clearReconnectTimeout();
    const openResult = await this.openSocket();

    if (!openResult.connected) {
      throw ProviderConnectionError.fromReason(this.id, openResult.reason);
    }
  }

  public async disconnect(): Promise<void> {
    this.manualDisconnect = true;
    this.clearReconnectTimeout();
    this.closeActiveSocket();
    this.emitStatus("disconnected", CLOSE_REASON_MANUAL_DISCONNECT);
    await this.timeUtils.sleep(0);
  }

  public handleRawMessage(message: string): void {
    try {
      const dataEvents = this.parseMessage(message);

      for (const event of dataEvents) {
        this.emit(event);
      }
    } catch (error) {
      const reason = error instanceof Error ? error.message : "unknown parse error";
      const parseError = ProviderParseError.fromReason(this.id, reason);
      this.emitStatus("error", parseError.message);
    }
  }

  /**
   * @section static:methods
   */

  // empty
}
