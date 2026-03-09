/**
 * @section consts
 */

const EMPTY_SYMBOL = "";

export class SymbolService {
  /**
   * @section factory
   */

  public static create(): SymbolService {
    const service = new SymbolService();
    return service;
  }

  /**
   * @section private:methods
   */

  private normalizeSingleSymbol(symbolInput: string): string {
    const normalizedSymbol = symbolInput.trim().toLowerCase();
    return normalizedSymbol;
  }

  /**
   * @section public:methods
   */

  public normalizeSymbol(symbolInput: string): string {
    let normalizedSymbol = EMPTY_SYMBOL;

    if (typeof symbolInput === "string") {
      normalizedSymbol = this.normalizeSingleSymbol(symbolInput);
    }

    return normalizedSymbol;
  }

  public normalizeSymbols(symbolInputs: string[]): string[] {
    const normalizedSymbols: string[] = [];

    for (const symbolInput of symbolInputs) {
      const normalizedSymbol = this.normalizeSymbol(symbolInput);

      if (normalizedSymbol.length > 0) {
        normalizedSymbols.push(normalizedSymbol);
      }
    }

    return normalizedSymbols;
  }
}
