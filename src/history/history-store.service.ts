/**
 * @section imports:internals
 */

import type { CryptoProviderId, CryptoSymbol, PricePoint } from "../provider/provider.types.ts";
import type { HistoryDataPoint, HistoryEventType, HistoryRangeQuery, HistoryRetentionConfig } from "./history.types.ts";

/**
 * @section consts
 */

const EMPTY_HISTORY_SERIES: HistoryDataPoint[] = [];

/**
 * @section types
 */

type ClosestPriceCandidate = {
  diff: number;
  point: PricePoint;
};

export class HistoryStoreService {
  /**
   * @section private:attributes
   */

  private readonly retentionConfig: HistoryRetentionConfig;

  /**
   * @section private:properties
   */

  private readonly pointsByStream: Map<string, HistoryDataPoint[]>;

  /**
   * @section constructor
   */

  public constructor(retentionConfig: HistoryRetentionConfig) {
    this.retentionConfig = retentionConfig;
    this.pointsByStream = new Map<string, HistoryDataPoint[]>();
  }

  /**
   * @section factory
   */

  public static create(retentionConfig: HistoryRetentionConfig): HistoryStoreService {
    const service = new HistoryStoreService(retentionConfig);
    return service;
  }

  /**
   * @section private:methods
   */

  private toStreamKey(eventType: HistoryEventType, symbol: CryptoSymbol, provider: CryptoProviderId): string {
    const streamKey = `${eventType}:${symbol}:${provider}`;
    return streamKey;
  }

  private getMaxHistorySize(eventType: HistoryEventType): number {
    let maxHistorySize = this.retentionConfig.maxSamplesPerStream;

    if (eventType === "trade") {
      maxHistorySize = this.retentionConfig.maxTradesPerStream;
    }

    return maxHistorySize;
  }

  private pruneSeries(historySeries: HistoryDataPoint[], eventType: HistoryEventType, currentTs: number): HistoryDataPoint[] {
    const cutoffTs = currentTs - this.retentionConfig.windowMs;
    const windowSeries: HistoryDataPoint[] = [];

    for (const historyPoint of historySeries) {
      if (historyPoint.ts >= cutoffTs) {
        windowSeries.push(historyPoint);
      }
    }

    const maxHistorySize = this.getMaxHistorySize(eventType);
    const prunedSeries = windowSeries.slice(0, maxHistorySize);
    return prunedSeries;
  }

  private getSeries(eventType: HistoryEventType, symbol: CryptoSymbol, provider: CryptoProviderId): HistoryDataPoint[] {
    const streamKey = this.toStreamKey(eventType, symbol, provider);
    const storedSeries = this.pointsByStream.get(streamKey);
    let historySeries = EMPTY_HISTORY_SERIES;

    if (storedSeries !== undefined) {
      historySeries = storedSeries;
    }

    return historySeries;
  }

  private getProviderIds(eventType: HistoryEventType, symbol: CryptoSymbol): CryptoProviderId[] {
    const providerIds = new Set<CryptoProviderId>();

    for (const streamKey of this.pointsByStream.keys()) {
      const keyParts = streamKey.split(":");
      const keyEventType = keyParts[0] as HistoryEventType;
      const keySymbol = keyParts[1] as CryptoSymbol;
      const keyProvider = keyParts[2] as CryptoProviderId;

      if (keyEventType === eventType && keySymbol === symbol) {
        providerIds.add(keyProvider);
      }
    }

    const providerList = Array.from(providerIds);
    return providerList;
  }

  private toAscending(historySeries: HistoryDataPoint[]): HistoryDataPoint[] {
    const ascendingSeries = [...historySeries];
    ascendingSeries.reverse();
    return ascendingSeries;
  }

  private mergeSeriesByTime(historySeriesGroups: HistoryDataPoint[][]): HistoryDataPoint[] {
    const mergedSeries: HistoryDataPoint[] = [];

    for (const historySeries of historySeriesGroups) {
      for (const historyPoint of historySeries) {
        mergedSeries.push(historyPoint);
      }
    }

    mergedSeries.sort((leftPoint, rightPoint) => {
      let comparison = leftPoint.ts - rightPoint.ts;

      if (comparison === 0) {
        comparison = leftPoint.provider.localeCompare(rightPoint.provider);
      }

      return comparison;
    });

    return mergedSeries;
  }

  /**
   * @section public:methods
   */

  public append(point: HistoryDataPoint, currentTs: number): void {
    const streamKey = this.toStreamKey(point.type, point.symbol, point.provider);
    const currentSeries = this.pointsByStream.get(streamKey) ?? [];
    const updatedSeries = [point, ...currentSeries];
    const prunedSeries = this.pruneSeries(updatedSeries, point.type, currentTs);
    this.pointsByStream.set(streamKey, prunedSeries);
  }

  public getLatest(eventType: HistoryEventType, symbol: CryptoSymbol, provider?: CryptoProviderId): HistoryDataPoint | null {
    let latestPoint: HistoryDataPoint | null = null;

    if (provider !== undefined) {
      const providerSeries = this.getSeries(eventType, symbol, provider);
      latestPoint = providerSeries[0] ?? null;
    } else {
      const providerIds = this.getProviderIds(eventType, symbol);

      for (const providerId of providerIds) {
        const providerSeries = this.getSeries(eventType, symbol, providerId);
        const candidatePoint = providerSeries[0] ?? null;
        const shouldReplace = candidatePoint !== null && (latestPoint === null || candidatePoint.ts > latestPoint.ts);

        if (shouldReplace) {
          latestPoint = candidatePoint;
        }
      }
    }

    return latestPoint;
  }

  public getRange(query: HistoryRangeQuery): HistoryDataPoint[] {
    const historySeriesGroups: HistoryDataPoint[][] = [];

    if (query.provider !== undefined) {
      const providerSeries = this.getSeries(query.eventType, query.symbol, query.provider);
      historySeriesGroups.push(this.toAscending(providerSeries));
    } else {
      const providerIds = this.getProviderIds(query.eventType, query.symbol);

      for (const providerId of providerIds) {
        const providerSeries = this.getSeries(query.eventType, query.symbol, providerId);
        historySeriesGroups.push(this.toAscending(providerSeries));
      }
    }

    const mergedSeries = this.mergeSeriesByTime(historySeriesGroups);
    const rangeSeries: HistoryDataPoint[] = [];

    for (const historyPoint of mergedSeries) {
      const isInsideRange = historyPoint.ts >= query.fromTs && historyPoint.ts <= query.toTs;

      if (isInsideRange) {
        rangeSeries.push(historyPoint);
      }
    }

    return rangeSeries;
  }

  public getClosestPrice(symbol: CryptoSymbol, targetTs: number, provider?: CryptoProviderId): PricePoint | null {
    const rangeQuery: HistoryRangeQuery =
      provider === undefined
        ? { eventType: "price", symbol, fromTs: Number.MIN_SAFE_INTEGER, toTs: Number.MAX_SAFE_INTEGER }
        : { eventType: "price", symbol, fromTs: Number.MIN_SAFE_INTEGER, toTs: Number.MAX_SAFE_INTEGER, provider };
    const pricePoints = this.getRange(rangeQuery);
    let closestCandidate: ClosestPriceCandidate | null = null;

    for (const historyPoint of pricePoints) {
      const pricePoint = historyPoint as PricePoint;
      const diff = Math.abs(pricePoint.ts - targetTs);
      const shouldReplace =
        closestCandidate === null || diff < closestCandidate.diff || (diff === closestCandidate.diff && pricePoint.ts < closestCandidate.point.ts);

      if (shouldReplace) {
        closestCandidate = { diff, point: pricePoint };
      }
    }

    const closestPoint = closestCandidate === null ? null : closestCandidate.point;
    return closestPoint;
  }
}
