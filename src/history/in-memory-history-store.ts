/**
 * @section imports:externals
 */

// empty

/**
 * @section imports:internals
 */

import type {
  CryptoProviderId,
  CryptoSymbol,
  PricePoint
} from "../providers/shared/provider-types.js";
import type {
  HistoryDataPoint,
  HistoryEventType,
  HistoryRangeQuery,
  HistoryRetentionConfig
} from "./history-types.js";

/**
 * @section consts
 */

const EMPTY_SERIES: HistoryDataPoint[] = [];

/**
 * @section types
 */

type ClosestCandidate = { diff: number; point: PricePoint };

export class InMemoryHistoryStore {
  /**
   * @section private:attributes
   */

  private readonly retention: HistoryRetentionConfig;

  /**
   * @section protected:attributes
   */

  // empty

  /**
   * @section private:properties
   */

  private readonly pointsByStream: Map<string, HistoryDataPoint[]>;

  /**
   * @section public:properties
   */

  // empty

  /**
   * @section constructor
   */

  public constructor(retention: HistoryRetentionConfig) {
    this.retention = retention;
    this.pointsByStream = new Map<string, HistoryDataPoint[]>();
  }

  /**
   * @section static:properties
   */

  // empty

  /**
   * @section factory
   */

  public static create(retention: HistoryRetentionConfig): InMemoryHistoryStore {
    const store = new InMemoryHistoryStore(retention);
    return store;
  }

  /**
   * @section private:methods
   */

  private toStreamKey(
    eventType: HistoryEventType,
    symbol: CryptoSymbol,
    provider: CryptoProviderId
  ): string {
    const key = `${eventType}:${symbol}:${provider}`;
    return key;
  }

  private getMaxSize(eventType: HistoryEventType): number {
    let maxSize = this.retention.maxSamplesPerStream;

    if (eventType === "trade") {
      maxSize = this.retention.maxTradesPerStream;
    }

    return maxSize;
  }

  private pruneSeries(
    points: HistoryDataPoint[],
    eventType: HistoryEventType,
    nowTs: number
  ): HistoryDataPoint[] {
    const cutoffTs = nowTs - this.retention.windowMs;
    const windowFiltered: HistoryDataPoint[] = [];

    for (const point of points) {
      if (point.ts >= cutoffTs) {
        windowFiltered.push(point);
      }
    }

    const maxSize = this.getMaxSize(eventType);
    const pruned = windowFiltered.slice(0, maxSize);
    return pruned;
  }

  private getSeries(
    eventType: HistoryEventType,
    symbol: CryptoSymbol,
    provider: CryptoProviderId
  ): HistoryDataPoint[] {
    const key = this.toStreamKey(eventType, symbol, provider);
    const storedSeries = this.pointsByStream.get(key);
    let series = EMPTY_SERIES;

    if (storedSeries) {
      series = storedSeries;
    }

    return series;
  }

  private getProvidersFor(eventType: HistoryEventType, symbol: CryptoSymbol): CryptoProviderId[] {
    const providers = new Set<CryptoProviderId>();

    for (const key of this.pointsByStream.keys()) {
      const parts = key.split(":");
      const keyEventType = parts[0] as HistoryEventType;
      const keySymbol = parts[1] as CryptoSymbol;
      const keyProvider = parts[2] as CryptoProviderId;

      if (keyEventType === eventType && keySymbol === symbol) {
        providers.add(keyProvider);
      }
    }

    const providerList = Array.from(providers);
    return providerList;
  }

  private toAscending(pointsDesc: HistoryDataPoint[]): HistoryDataPoint[] {
    const ascending = [...pointsDesc];
    ascending.reverse();
    return ascending;
  }

  private mergeSeriesByTime(pointsByProvider: HistoryDataPoint[][]): HistoryDataPoint[] {
    const merged: HistoryDataPoint[] = [];

    for (const providerSeries of pointsByProvider) {
      for (const point of providerSeries) {
        merged.push(point);
      }
    }

    merged.sort((left, right) => {
      let comparison = left.ts - right.ts;

      if (comparison === 0) {
        comparison = left.provider.localeCompare(right.provider);
      }

      return comparison;
    });

    return merged;
  }

  /**
   * @section protected:methods
   */

  // empty

  /**
   * @section public:methods
   */

  public append(point: HistoryDataPoint, nowTs: number): void {
    const key = this.toStreamKey(point.type, point.symbol, point.provider);
    const current = this.pointsByStream.get(key) ?? [];
    const updated = [point, ...current];
    const pruned = this.pruneSeries(updated, point.type, nowTs);
    this.pointsByStream.set(key, pruned);
  }

  public getLatest(
    eventType: HistoryEventType,
    symbol: CryptoSymbol,
    provider?: CryptoProviderId
  ): HistoryDataPoint | null {
    let latest: HistoryDataPoint | null = null;

    if (provider) {
      const providerSeries = this.getSeries(eventType, symbol, provider);
      latest = providerSeries[0] ?? null;
    } else {
      const providers = this.getProvidersFor(eventType, symbol);

      for (const providerId of providers) {
        const providerSeries = this.getSeries(eventType, symbol, providerId);
        const candidate = providerSeries[0] ?? null;

        if (candidate && (!latest || candidate.ts > latest.ts)) {
          latest = candidate;
        }
      }
    }

    return latest;
  }

  public getRange(query: HistoryRangeQuery): HistoryDataPoint[] {
    const providerSeries: HistoryDataPoint[][] = [];

    if (query.provider) {
      const seriesDesc = this.getSeries(query.eventType, query.symbol, query.provider);
      providerSeries.push(this.toAscending(seriesDesc));
    } else {
      const providers = this.getProvidersFor(query.eventType, query.symbol);

      for (const provider of providers) {
        const seriesDesc = this.getSeries(query.eventType, query.symbol, provider);
        providerSeries.push(this.toAscending(seriesDesc));
      }
    }

    const mergedAsc = this.mergeSeriesByTime(providerSeries);
    const ranged: HistoryDataPoint[] = [];

    for (const point of mergedAsc) {
      if (point.ts >= query.fromTs && point.ts <= query.toTs) {
        ranged.push(point);
      }
    }

    return ranged;
  }

  public getClosestPrice(
    symbol: CryptoSymbol,
    targetTs: number,
    provider?: CryptoProviderId
  ): PricePoint | null {
    const query =
      provider === undefined
        ? {
            eventType: "price" as const,
            symbol,
            fromTs: Number.MIN_SAFE_INTEGER,
            toTs: Number.MAX_SAFE_INTEGER
          }
        : {
            eventType: "price" as const,
            symbol,
            fromTs: Number.MIN_SAFE_INTEGER,
            toTs: Number.MAX_SAFE_INTEGER,
            provider
          };
    const ranged = this.getRange(query);
    let closest: ClosestCandidate | null = null;

    for (const point of ranged) {
      const pricePoint = point as PricePoint;
      const diff = Math.abs(pricePoint.ts - targetTs);

      if (
        !closest ||
        diff < closest.diff ||
        (diff === closest.diff && pricePoint.ts < closest.point.ts)
      ) {
        closest = { diff, point: pricePoint };
      }
    }

    const result = closest ? closest.point : null;
    return result;
  }

  /**
   * @section static:methods
   */

  // empty
}
