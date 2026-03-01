/**
 * @section imports:externals
 */

// empty

/**
 * @section imports:internals
 */

// empty

/**
 * @section consts
 */

// empty

/**
 * @section types
 */

export type TimeProvider = () => number;

export class TimeUtils {
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

  private readonly nowProvider: TimeProvider;

  /**
   * @section public:properties
   */

  // empty

  /**
   * @section constructor
   */

  public constructor(nowProvider: TimeProvider) {
    this.nowProvider = nowProvider;
  }

  /**
   * @section static:properties
   */

  // empty

  /**
   * @section factory
   */

  public static createSystemTime(): TimeUtils {
    const utils = new TimeUtils(() => {
      const now = Date.now();
      return now;
    });
    return utils;
  }

  /**
   * @section private:methods
   */

  // empty

  /**
   * @section protected:methods
   */

  // empty

  /**
   * @section public:methods
   */

  public now(): number {
    const now = this.nowProvider();
    return now;
  }

  public sleep(waitMs: number): Promise<void> {
    const promise = new Promise<void>((resolve) => {
      setTimeout(resolve, waitMs);
    });
    return promise;
  }

  /**
   * @section static:methods
   */

  // empty
}
