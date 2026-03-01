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

export class NoProvidersConnectedError extends Error {
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

  private readonly failedProviders: string[];

  /**
   * @section public:properties
   */

  // empty

  /**
   * @section constructor
   */

  public constructor(failedProviders: string[]) {
    super(`No providers connected. Failed providers: ${failedProviders.join(", ")}`);
    this.name = "NoProvidersConnectedError";
    this.failedProviders = failedProviders;
  }

  /**
   * @section static:properties
   */

  // empty

  /**
   * @section factory
   */

  public static fromProviders(failedProviders: string[]): NoProvidersConnectedError {
    const error = new NoProvidersConnectedError(failedProviders);
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

  public getFailedProviders(): string[] {
    const providers = [...this.failedProviders];
    return providers;
  }

  /**
   * @section static:methods
   */

  // empty
}
