/**
 * @section types
 */

export class NoProvidersConnectedError extends Error {
  /**
   * @section private:properties
   */

  private readonly failedProviders: string[];

  /**
   * @section constructor
   */

  public constructor(failedProviders: string[]) {
    super(`No providers connected. Failed providers: ${failedProviders.join(", ")}`);
    this.name = "NoProvidersConnectedError";
    this.failedProviders = failedProviders;
  }

  /**
   * @section factory
   */

  public static fromProviders(failedProviders: string[]): NoProvidersConnectedError {
    const error = new NoProvidersConnectedError(failedProviders);
    return error;
  }

  /**
   * @section public:methods
   */

  public getFailedProviders(): string[] {
    const providers = [...this.failedProviders];
    return providers;
  }
}
