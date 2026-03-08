export type CoinbaseEnvelope = {
  type?: string;
  product_id?: string;
  time?: string;
  price?: string;
  bids?: [string, string][];
  asks?: [string, string][];
  changes?: ["buy" | "sell", string, string][];
};

export type CoinbaseLocalBook = {
  symbol: string;
  asks: { price: number; size: number }[];
  bids: { price: number; size: number }[];
};
