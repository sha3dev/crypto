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

export class ProviderParseError extends Error {
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

  private readonly providerName: string;

  /**
   * @section public:properties
   */

  // empty

  /**
   * @section constructor
   */

  public constructor(providerName: string, reason: string) {
    super(`Provider '${providerName}' parse failed: ${reason}`);
    this.name = "ProviderParseError";
    this.providerName = providerName;
  }

  /**
   * @section static:properties
   */

  // empty

  /**
   * @section factory
   */

  public static fromReason(providerName: string, reason: string): ProviderParseError {
    const error = new ProviderParseError(providerName, reason);
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

  public getProviderName(): string {
    const result = this.providerName;
    return result;
  }

  /**
   * @section static:methods
   */

  // empty
}
