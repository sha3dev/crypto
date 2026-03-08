/**
 * @section types
 */

export class ProviderParseError extends Error {
  /**
   * @section private:properties
   */

  private readonly providerName: string;

  /**
   * @section constructor
   */

  public constructor(providerName: string, reason: string) {
    super(`Provider '${providerName}' parse failed: ${reason}`);
    this.name = "ProviderParseError";
    this.providerName = providerName;
  }

  /**
   * @section factory
   */

  public static fromReason(providerName: string, reason: string): ProviderParseError {
    const error = new ProviderParseError(providerName, reason);
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
