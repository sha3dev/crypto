/**
 * @section imports:internals
 */

import type { HistoryQuery } from "../client/client.types.ts";
import type { CryptoProviderId, CryptoSymbol, OrderBookSnapshot, PricePoint, TradePoint } from "../provider/provider.types.ts";
import type { SymbolService } from "../symbol/symbol.service.ts";
import type { HistoryStoreService } from "./history-store.service.ts";
import type { HistoryRangeQuery } from "./history.types.ts";

export class HistoryQueryService {
  /**
   * @section private:attributes
   */

  private readonly historyStoreService: HistoryStoreService;

  /**
   * @section private:properties
   */

  private readonly symbolService: SymbolService;

  /**
   * @section constructor
   */

  public constructor(historyStoreService: HistoryStoreService, symbolService: SymbolService) {
    this.historyStoreService = historyStoreService;
    this.symbolService = symbolService;
  }

  /**
   * @section factory
   */

  public static create(historyStoreService: HistoryStoreService, symbolService: SymbolService): HistoryQueryService {
    const service = new HistoryQueryService(historyStoreService, symbolService);
    return service;
  }

  /**
   * @section private:methods
   */

  private validateRange(fromTs: number, toTs: number): void {
    const isFiniteRange = Number.isFinite(fromTs) && Number.isFinite(toTs);

    if (!isFiniteRange) {
      throw new Error("fromTs and toTs must be finite numbers");
    }

    if (fromTs > toTs) {
      throw new Error("fromTs must be less than or equal to toTs");
    }
  }

  private normalizeSymbol(symbol: CryptoSymbol): CryptoSymbol {
    const normalizedSymbol = this.symbolService.normalizeSymbol(symbol);

    if (normalizedSymbol.length === 0) {
      throw new Error("symbol is required");
    }

    return normalizedSymbol;
  }

  private toRangeQuery(eventType: "price" | "orderbook" | "trade", query: HistoryQuery): HistoryRangeQuery {
    const normalizedSymbol = this.normalizeSymbol(query.symbol);
    this.validateRange(query.fromTs, query.toTs);
    const rangeQuery: HistoryRangeQuery =
      query.provider === undefined
        ? { eventType, symbol: normalizedSymbol, fromTs: query.fromTs, toTs: query.toTs }
        : { eventType, symbol: normalizedSymbol, fromTs: query.fromTs, toTs: query.toTs, provider: query.provider };
    return rangeQuery;
  }

  /**
   * @section public:methods
   */

  public getLatestPrice(symbol: CryptoSymbol, provider?: CryptoProviderId): PricePoint | null {
    const normalizedSymbol = this.normalizeSymbol(symbol);
    const latestPoint = this.historyStoreService.getLatest("price", normalizedSymbol, provider);
    return latestPoint as PricePoint | null;
  }

  public getLatestOrderBook(symbol: CryptoSymbol, provider?: CryptoProviderId): OrderBookSnapshot | null {
    const normalizedSymbol = this.normalizeSymbol(symbol);
    const latestPoint = this.historyStoreService.getLatest("orderbook", normalizedSymbol, provider);
    return latestPoint as OrderBookSnapshot | null;
  }

  public getLatestTrade(symbol: CryptoSymbol, provider?: CryptoProviderId): TradePoint | null {
    const normalizedSymbol = this.normalizeSymbol(symbol);
    const latestPoint = this.historyStoreService.getLatest("trade", normalizedSymbol, provider);
    return latestPoint as TradePoint | null;
  }

  public getPriceClosestTo(symbol: CryptoSymbol, targetTs: number, provider?: CryptoProviderId): PricePoint | null {
    const normalizedSymbol = this.normalizeSymbol(symbol);
    const isFiniteTarget = Number.isFinite(targetTs);

    if (!isFiniteTarget) {
      throw new Error("targetTs must be a finite number");
    }

    const closestPoint = this.historyStoreService.getClosestPrice(normalizedSymbol, targetTs, provider);
    return closestPoint;
  }

  public getPriceHistory(query: HistoryQuery): PricePoint[] {
    const rangeQuery = this.toRangeQuery("price", query);
    const historyPoints = this.historyStoreService.getRange(rangeQuery);
    return historyPoints as PricePoint[];
  }

  public getOrderBookHistory(query: HistoryQuery): OrderBookSnapshot[] {
    const rangeQuery = this.toRangeQuery("orderbook", query);
    const historyPoints = this.historyStoreService.getRange(rangeQuery);
    return historyPoints as OrderBookSnapshot[];
  }

  public getTradeHistory(query: HistoryQuery): TradePoint[] {
    const rangeQuery = this.toRangeQuery("trade", query);
    const historyPoints = this.historyStoreService.getRange(rangeQuery);
    return historyPoints as TradePoint[];
  }
}
