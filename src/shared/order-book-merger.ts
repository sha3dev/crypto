/**
 * @section imports:externals
 */

// empty

/**
 * @section imports:internals
 */

import type { OrderBookLevel } from "../providers/shared/provider-types.js";

/**
 * @section consts
 */

// empty

/**
 * @section types
 */

type MergeResult = { asks: OrderBookLevel[]; bids: OrderBookLevel[] };
type MergeOrderBookOptions = {
  currentAsks: OrderBookLevel[];
  currentBids: OrderBookLevel[];
  deltaAsks: OrderBookLevel[];
  deltaBids: OrderBookLevel[];
  maxLevels: number;
};

export class OrderBookMerger {
  /**
   * @section private:attributes
   */

  // empty

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

  // empty

  /**
   * @section static:properties
   */

  // empty

  /**
   * @section factory
   */

  public static create(): OrderBookMerger {
    const merger = new OrderBookMerger();
    return merger;
  }

  /**
   * @section private:methods
   */

  private toMap(levels: OrderBookLevel[]): Map<number, number> {
    const levelsByPrice = new Map<number, number>();

    for (const level of levels) {
      levelsByPrice.set(level.price, level.size);
    }

    return levelsByPrice;
  }

  private mergeSide(
    current: OrderBookLevel[],
    delta: OrderBookLevel[],
    descending: boolean,
    maxLevels: number
  ): OrderBookLevel[] {
    const mergedByPrice = this.toMap(current);

    for (const level of delta) {
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

    mergedLevels.sort((left, right) => {
      let comparison = left.price - right.price;
      if (descending) {
        comparison = right.price - left.price;
      }
      return comparison;
    });

    const limitedLevels = mergedLevels.slice(0, maxLevels);
    return limitedLevels;
  }

  /**
   * @section protected:methods
   */

  // empty

  /**
   * @section public:methods
   */

  public merge(options: MergeOrderBookOptions): MergeResult {
    const asks = this.mergeSide(options.currentAsks, options.deltaAsks, false, options.maxLevels);
    const bids = this.mergeSide(options.currentBids, options.deltaBids, true, options.maxLevels);
    const result: MergeResult = { asks, bids };
    return result;
  }

  /**
   * @section static:methods
   */

  // empty
}
