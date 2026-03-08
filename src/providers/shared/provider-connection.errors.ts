/**
 * @section types
 */

export class ProviderConnectionError extends Error {
  /**
   * @section private:properties
   */

  private readonly providerName: string;

  /**
   * @section constructor
   */

  public constructor(providerName: string, reason: string) {
    super(`Provider '${providerName}' connection failed: ${reason}`);
    this.name = "ProviderConnectionError";
    this.providerName = providerName;
  }

  /**
   * @section factory
   */

  public static fromReason(providerName: string, reason: string): ProviderConnectionError {
    const error = new ProviderConnectionError(providerName, reason);
    return error;
  }

  /**
   * @section public:methods
   */

  public getProviderName(): string {
    const providerName = this.providerName;
    return providerName;
  }
}
