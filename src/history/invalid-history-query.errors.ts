/**
 * @section types
 */

export class InvalidHistoryQueryError extends Error {
  /**
   * @section private:properties
   */

  private readonly reason: string;

  /**
   * @section constructor
   */

  public constructor(reason: string) {
    super(`Invalid history query: ${reason}`);
    this.name = "InvalidHistoryQueryError";
    this.reason = reason;
  }

  /**
   * @section factory
   */

  public static forReason(reason: string): InvalidHistoryQueryError {
    const error = new InvalidHistoryQueryError(reason);
    return error;
  }

  /**
   * @section public:methods
   */

  public getReason(): string {
    const storedReason = this.reason;
    return storedReason;
  }
}
