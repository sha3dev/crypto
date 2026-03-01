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

const EMPTY_TEXT = "";

/**
 * @section types
 */

// empty

export class SymbolNormalizer {
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

  public static create(): SymbolNormalizer {
    const normalizer = new SymbolNormalizer();
    return normalizer;
  }

  /**
   * @section private:methods
   */

  private normalizeSingleSymbol(input: string): string {
    const normalizedSymbol = input.trim().toLowerCase();
    return normalizedSymbol;
  }

  /**
   * @section protected:methods
   */

  // empty

  /**
   * @section public:methods
   */

  public normalizeSymbol(input: string): string {
    let normalizedSymbol = EMPTY_TEXT;

    if (typeof input === "string") {
      normalizedSymbol = this.normalizeSingleSymbol(input);
    }

    return normalizedSymbol;
  }

  public normalizeSymbols(inputs: string[]): string[] {
    const normalizedSymbols: string[] = [];

    for (const input of inputs) {
      const normalizedSymbol = this.normalizeSymbol(input);
      if (normalizedSymbol.length > 0) {
        normalizedSymbols.push(normalizedSymbol);
      }
    }

    return normalizedSymbols;
  }

  /**
   * @section static:methods
   */

  // empty
}
