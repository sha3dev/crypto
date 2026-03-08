/**
 * @section imports:internals
 */

import type { HistoryQuery } from "../client/client.types.ts";
import type { CryptoProviderId, CryptoSymbol, OrderBookSnapshot, PricePoint, TradePoint } from "../providers/shared/provider.types.ts";
import type { SymbolNormalizerService } from "../shared/symbol-normalizer.service.ts";
import type { InMemoryHistoryService } from "./in-memory-history.service.ts";
import { InvalidHistoryQueryError } from "./invalid-history-query.errors.ts";

export class HistoryQueryService {
  /**
   * @section private:attributes
   */

  private readonly historyService: InMemoryHistoryService;

  /**
   * @section private:properties
   */

  private readonly symbolNormalizerService: SymbolNormalizerService;

  /**
   * @section constructor
   */

  public constructor(historyService: InMemoryHistoryService, symbolNormalizerService: SymbolNormalizerService) {
    this.historyService = historyService;
    this.symbolNormalizerService = symbolNormalizerService;
  }

  /**
   * @section factory
   */

  public static create(historyService: InMemoryHistoryService, symbolNormalizerService: SymbolNormalizerService): HistoryQueryService {
    const service = new HistoryQueryService(historyService, symbolNormalizerService);
    return service;
  }

  /**
   * @section private:methods
   */

  private validateRange(fromTs: number, toTs: number): void {
    const isFiniteRange = Number.isFinite(fromTs) && Number.isFinite(toTs);

    if (!isFiniteRange) {
      throw InvalidHistoryQueryError.forReason("fromTs and toTs must be finite numbers");
    }

    if (fromTs > toTs) {
      throw InvalidHistoryQueryError.forReason("fromTs must be less than or equal to toTs");
    }
  }

  private normalizeSymbol(symbol: CryptoSymbol): CryptoSymbol {
    const normalizedSymbol = this.symbolNormalizerService.normalizeSymbol(symbol);

    if (normalizedSymbol.length === 0) {
      throw InvalidHistoryQueryError.forReason("symbol is required");
    }

    return normalizedSymbol;
  }

  private toRangeQuery(eventType: "price" | "orderbook" | "trade", query: HistoryQuery): HistoryQuery {
    const normalizedSymbol = this.normalizeSymbol(query.symbol);
    const normalizedProvider = query.provider;
    this.validateRange(query.fromTs, query.toTs);
    const rangeQuery =
      normalizedProvider === undefined
        ? {
            eventType,
            symbol: normalizedSymbol,
            fromTs: query.fromTs,
            toTs: query.toTs,
          }
        : {
            eventType,
            symbol: normalizedSymbol,
            fromTs: query.fromTs,
            toTs: query.toTs,
            provider: normalizedProvider,
          };
    return rangeQuery as unknown as HistoryQuery;
  }

  /**
   * @section public:methods
   */

  public getLatestPrice(symbol: CryptoSymbol, provider?: CryptoProviderId): PricePoint | null {
    const normalizedSymbol = this.normalizeSymbol(symbol);
    const latestPoint = this.historyService.getLatest("price", normalizedSymbol, provider);
    return latestPoint as PricePoint | null;
  }

  public getLatestOrderBook(symbol: CryptoSymbol, provider?: CryptoProviderId): OrderBookSnapshot | null {
    const normalizedSymbol = this.normalizeSymbol(symbol);
    const latestPoint = this.historyService.getLatest("orderbook", normalizedSymbol, provider);
    return latestPoint as OrderBookSnapshot | null;
  }

  public getLatestTrade(symbol: CryptoSymbol, provider?: CryptoProviderId): TradePoint | null {
    const normalizedSymbol = this.normalizeSymbol(symbol);
    const latestPoint = this.historyService.getLatest("trade", normalizedSymbol, provider);
    return latestPoint as TradePoint | null;
  }

  public getPriceClosestTo(symbol: CryptoSymbol, targetTs: number, provider?: CryptoProviderId): PricePoint | null {
    const normalizedSymbol = this.normalizeSymbol(symbol);
    const isFiniteTarget = Number.isFinite(targetTs);

    if (!isFiniteTarget) {
      throw InvalidHistoryQueryError.forReason("targetTs must be a finite number");
    }

    const closestPoint = this.historyService.getClosestPrice(normalizedSymbol, targetTs, provider);
    return closestPoint;
  }

  public getPriceHistory(query: HistoryQuery): PricePoint[] {
    const rangeQuery = this.toRangeQuery("price", query);
    const historyPoints = this.historyService.getRange(rangeQuery as never);
    return historyPoints as PricePoint[];
  }

  public getOrderBookHistory(query: HistoryQuery): OrderBookSnapshot[] {
    const rangeQuery = this.toRangeQuery("orderbook", query);
    const historyPoints = this.historyService.getRange(rangeQuery as never);
    return historyPoints as OrderBookSnapshot[];
  }

  public getTradeHistory(query: HistoryQuery): TradePoint[] {
    const rangeQuery = this.toRangeQuery("trade", query);
    const historyPoints = this.historyService.getRange(rangeQuery as never);
    return historyPoints as TradePoint[];
  }
}
