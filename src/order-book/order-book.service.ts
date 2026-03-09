/**
 * @section imports:internals
 */

import type { OrderBookLevel } from "../provider/provider.types.ts";

/**
 * @section types
 */

type MergeBookOptions = {
  currentAsks: OrderBookLevel[];
  currentBids: OrderBookLevel[];
  deltaAsks: OrderBookLevel[];
  deltaBids: OrderBookLevel[];
  maxLevels: number;
};

type MergeBookResult = {
  asks: OrderBookLevel[];
  bids: OrderBookLevel[];
};

export class OrderBookService {
  /**
   * @section factory
   */

  public static create(): OrderBookService {
    const service = new OrderBookService();
    return service;
  }

  /**
   * @section private:methods
   */

  private toLevelsByPrice(levels: OrderBookLevel[]): Map<number, number> {
    const levelsByPrice = new Map<number, number>();

    for (const level of levels) {
      levelsByPrice.set(level.price, level.size);
    }

    return levelsByPrice;
  }

  private mergeSide(currentLevels: OrderBookLevel[], deltaLevels: OrderBookLevel[], isDescending: boolean, maxLevels: number): OrderBookLevel[] {
    const mergedByPrice = this.toLevelsByPrice(currentLevels);

    for (const level of deltaLevels) {
      if (level.size <= 0) {
        mergedByPrice.delete(level.price);
      } else {
        mergedByPrice.set(level.price, level.size);
      }
    }

    const mergedLevels: OrderBookLevel[] = [];

    for (const [price, size] of mergedByPrice.entries()) {
      mergedLevels.push({ price, size });
    }

    mergedLevels.sort((leftLevel, rightLevel) => {
      let comparison = leftLevel.price - rightLevel.price;

      if (isDescending) {
        comparison = rightLevel.price - leftLevel.price;
      }

      return comparison;
    });

    const limitedLevels = mergedLevels.slice(0, maxLevels);
    return limitedLevels;
  }

  /**
   * @section public:methods
   */

  public merge(options: MergeBookOptions): MergeBookResult {
    const asks = this.mergeSide(options.currentAsks, options.deltaAsks, false, options.maxLevels);
    const bids = this.mergeSide(options.currentBids, options.deltaBids, true, options.maxLevels);
    const mergeResult: MergeBookResult = { asks, bids };
    return mergeResult;
  }
}
