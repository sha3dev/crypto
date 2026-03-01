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

// empty

export class InvalidHistoryQueryError extends Error {
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

  private readonly reason: string;

  /**
   * @section public:properties
   */

  // empty

  /**
   * @section constructor
   */

  public constructor(reason: string) {
    super(`Invalid history query: ${reason}`);
    this.name = "InvalidHistoryQueryError";
    this.reason = reason;
  }

  /**
   * @section static:properties
   */

  // empty

  /**
   * @section factory
   */

  public static forReason(reason: string): InvalidHistoryQueryError {
    const error = new InvalidHistoryQueryError(reason);
    return error;
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

  public getReason(): string {
    const reason = this.reason;
    return reason;
  }

  /**
   * @section static:methods
   */

  // empty
}
