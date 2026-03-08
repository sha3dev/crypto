/**
 * @section types
 */

export type CurrentTimeProvider = () => number;

export class ClockService {
  /**
   * @section private:properties
   */

  private readonly currentTimeProvider: CurrentTimeProvider;

  /**
   * @section constructor
   */

  public constructor(currentTimeProvider: CurrentTimeProvider) {
    this.currentTimeProvider = currentTimeProvider;
  }

  /**
   * @section factory
   */

  public static createSystemClock(): ClockService {
    const service = new ClockService(() => {
      const currentTime = Date.now();
      return currentTime;
    });
    return service;
  }

  /**
   * @section public:methods
   */

  public now(): number {
    const currentTime = this.currentTimeProvider();
    return currentTime;
  }

  public sleep(waitMs: number): Promise<void> {
    const sleepPromise = new Promise<void>((resolve) => {
      setTimeout(resolve, waitMs);
    });
    return sleepPromise;
  }
}
