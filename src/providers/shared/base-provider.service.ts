/**
 * @section imports:externals
 */

import WebSocket, { type RawData } from "ws";

/**
 * @section imports:internals
 */

import logger from "../../logger.ts";
import type { ClockService } from "../../shared/clock.service.ts";
import { ProviderConnectionError } from "./provider-connection.errors.ts";
import { ProviderParseError } from "./provider-parse.errors.ts";
import type { ProviderConnectionStatus } from "./provider-status.types.ts";
import type { FeedEvent, ProviderBaseOptions, ProviderContract, ProviderDataEvent, ProviderEventListener } from "./provider.types.ts";

/**
 * @section consts
 */

const MANUAL_DISCONNECT_REASON = "manual-disconnect";

/**
 * @section types
 */

export type WebSocketFactory = (connectionUrl: string) => WebSocket;

type OpenSocketResult = {
  isConnected: boolean;
  reason: string;
};

type OpenSocketResolver = (result: OpenSocketResult) => void;

type BaseProviderConstructorOptions = {
  id: ProviderContract["id"];
  clockService: ClockService;
  webSocketFactory: WebSocketFactory;
  providerOptions: ProviderBaseOptions;
};

export abstract class BaseProviderService implements ProviderContract {
  /**
   * @section private:attributes
   */

  private readonly clockService: ClockService;
  private readonly webSocketFactory: WebSocketFactory;
  private readonly providerOptions: ProviderBaseOptions;

  /**
   * @section private:properties
   */

  private listener: ProviderEventListener | null;
  private socket: WebSocket | null;
  private reconnectTimeout: NodeJS.Timeout | null;
  private reconnectAttempt: number;
  private isManualDisconnect: boolean;

  /**
   * @section public:properties
   */

  public readonly id: ProviderContract["id"];

  /**
   * @section constructor
   */

  public constructor(options: BaseProviderConstructorOptions) {
    this.id = options.id;
    this.clockService = options.clockService;
    this.webSocketFactory = options.webSocketFactory;
    this.providerOptions = options.providerOptions;
    this.listener = null;
    this.socket = null;
    this.reconnectTimeout = null;
    this.reconnectAttempt = 0;
    this.isManualDisconnect = false;
  }

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
      ts: this.clockService.now(),
      status,
      message,
    };
    this.logStatus(status, message);
    this.emit(event);
  }

  private logStatus(status: ProviderConnectionStatus, message: string): void {
    const logMessage = `[${this.id}] ${status}: ${message}`;

    if (status === "error") {
      logger.error(logMessage);
    } else if (status === "reconnecting") {
      logger.warn(logMessage);
    } else {
      logger.debug(logMessage);
    }
  }

  private clearReconnectTimeout(): void {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
  }

  private getReconnectDelayMs(): number {
    let reconnectDelayMs = 0;
    this.reconnectAttempt += 1;

    if (this.reconnectAttempt === 1) {
      reconnectDelayMs = 0;
    } else {
      const backoffAttempt = this.reconnectAttempt - 1;
      const baseDelay = this.providerOptions.reconnectBaseDelayMs * 2 ** (backoffAttempt - 1);
      const cappedBaseDelay = Math.min(baseDelay, this.providerOptions.reconnectMaxDelayMs);
      const jitterRange = Math.round(cappedBaseDelay * this.providerOptions.reconnectJitterRatio);
      const jitter = Math.round(Math.random() * jitterRange);
      reconnectDelayMs = cappedBaseDelay + jitter;
    }

    return reconnectDelayMs;
  }

  private scheduleReconnect(): void {
    const hasReconnectTimeout = this.reconnectTimeout !== null;

    if (!hasReconnectTimeout) {
      const reconnectDelayMs = this.getReconnectDelayMs();
      this.emitStatus("reconnecting", `reconnecting in ${reconnectDelayMs}ms`);
      this.reconnectTimeout = setTimeout(() => {
        this.reconnectTimeout = null;
        void this.reconnect();
      }, reconnectDelayMs);
    }
  }

  private async reconnect(): Promise<void> {
    let reconnectReason = "unknown";

    if (!this.isManualDisconnect) {
      const openSocketResult = await this.openSocket();
      reconnectReason = openSocketResult.reason;

      if (!openSocketResult.isConnected) {
        this.emitStatus("error", `reconnect failed: ${reconnectReason}`);
        this.scheduleReconnect();
      }
    }
  }

  private decodeRawMessage(rawMessage: RawData): string {
    let messageText = "";

    if (typeof rawMessage === "string") {
      messageText = rawMessage;
    } else if (Buffer.isBuffer(rawMessage)) {
      messageText = rawMessage.toString("utf8");
    } else if (Array.isArray(rawMessage)) {
      messageText = Buffer.concat(rawMessage).toString("utf8");
    } else {
      messageText = Buffer.from(rawMessage).toString("utf8");
    }

    return messageText;
  }

  private closeActiveSocket(): void {
    if (this.socket) {
      const activeSocket = this.socket;
      this.socket = null;
      this.onSocketDisconnected();
      activeSocket.removeAllListeners();
      activeSocket.close();
    }
  }

  private attachOpenListener(socket: WebSocket, settleOpenSocket: OpenSocketResolver): void {
    socket.on("open", () => {
      this.reconnectAttempt = 0;
      this.emitStatus("connected", "socket connected");
      this.sendSubscriptionMessages();
      this.onSocketConnected();
      settleOpenSocket({ isConnected: true, reason: "connected" });
    });
  }

  private attachMessageListener(socket: WebSocket): void {
    socket.on("message", (rawMessage: RawData) => {
      const messageText = this.decodeRawMessage(rawMessage);
      this.handleRawMessage(messageText);
    });
  }

  private attachErrorListener(socket: WebSocket, settleOpenSocket: OpenSocketResolver): void {
    socket.on("error", (socketError: Error) => {
      const connectionReason = socketError instanceof Error ? socketError.message : "unknown socket error";
      this.emitStatus("error", connectionReason);
      settleOpenSocket({ isConnected: false, reason: connectionReason });
    });
  }

  private attachCloseListener(socket: WebSocket, settleOpenSocket: OpenSocketResolver): void {
    socket.on("close", (_closeCode: number, reasonBuffer: Buffer) => {
      this.onSocketDisconnected();
      const decodedReason = Buffer.isBuffer(reasonBuffer) ? reasonBuffer.toString("utf8") : String(reasonBuffer ?? "");
      const closeReason = decodedReason || MANUAL_DISCONNECT_REASON;
      this.emitStatus("disconnected", closeReason);

      if (!this.isManualDisconnect) {
        this.scheduleReconnect();
      }

      settleOpenSocket({ isConnected: false, reason: closeReason });
    });
  }

  private attachSocketListeners(socket: WebSocket, resolveOpenSocket: OpenSocketResolver): void {
    let isSettled = false;
    const settleOpenSocket = (result: OpenSocketResult): void => {
      if (!isSettled) {
        isSettled = true;
        resolveOpenSocket(result);
      }
    };

    this.attachOpenListener(socket, settleOpenSocket);
    this.attachMessageListener(socket);
    this.attachErrorListener(socket, settleOpenSocket);
    this.attachCloseListener(socket, settleOpenSocket);
  }

  private async openSocket(): Promise<OpenSocketResult> {
    this.closeActiveSocket();
    const socket = this.webSocketFactory(this.getConnectionUrl());
    this.socket = socket;

    const openSocketPromise = new Promise<OpenSocketResult>((resolve) => {
      const connectTimeout = setTimeout(() => {
        resolve({ isConnected: false, reason: "connection timeout" });
      }, this.providerOptions.connectTimeoutMs);

      this.attachSocketListeners(socket, (result) => {
        clearTimeout(connectTimeout);
        resolve(result);
      });
    });
    const openSocketResult = await openSocketPromise;

    if (!openSocketResult.isConnected) {
      this.closeActiveSocket();
    }

    return openSocketResult;
  }

  /**
   * @section protected:methods
   */

  protected sendSubscriptionMessages(): void {
    const subscriptionMessages = this.buildSubscriptionMessages();
    const canSend = this.socket !== null && this.socket.readyState === WebSocket.OPEN;

    if (canSend) {
      const socket = this.socket;
      const hasSocket = socket !== null;

      if (hasSocket) {
        for (const subscriptionMessage of subscriptionMessages) {
          socket.send(subscriptionMessage);
        }
      }
    }
  }

  protected sendSocketMessage(messageText: string): void {
    const canSend = this.socket !== null && this.socket.readyState === WebSocket.OPEN;

    if (canSend) {
      const socket = this.socket;
      const hasSocket = socket !== null;

      if (hasSocket) {
        socket.send(messageText);
      }
    }
  }

  protected onSocketConnected(): void {}

  protected onSocketDisconnected(): void {}

  protected abstract getConnectionUrl(): string;

  protected abstract buildSubscriptionMessages(): string[];

  protected abstract parseMessage(messageText: string): ProviderDataEvent[];

  /**
   * @section public:methods
   */

  public async connect(listener: ProviderEventListener): Promise<void> {
    this.listener = listener;
    this.isManualDisconnect = false;
    this.clearReconnectTimeout();
    const openSocketResult = await this.openSocket();

    if (!openSocketResult.isConnected) {
      throw ProviderConnectionError.fromReason(this.id, openSocketResult.reason);
    }
  }

  public async disconnect(): Promise<void> {
    this.isManualDisconnect = true;
    this.clearReconnectTimeout();
    this.closeActiveSocket();
    this.emitStatus("disconnected", MANUAL_DISCONNECT_REASON);
    await this.clockService.sleep(0);
  }

  public handleRawMessage(messageText: string): void {
    try {
      const parsedEvents = this.parseMessage(messageText);

      for (const parsedEvent of parsedEvents) {
        this.emit(parsedEvent);
      }
    } catch (error) {
      const parseReason = error instanceof Error ? error.message : "unknown parse error";
      const parseError = ProviderParseError.fromReason(this.id, parseReason);
      this.emitStatus("error", parseError.message);
    }
  }
}
