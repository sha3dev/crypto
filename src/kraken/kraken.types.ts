export type KrakenEnvelope = {
  channel?: string;
  type?: string;
  data?: Array<Record<string, unknown>>;
};

export type KrakenLocalBook = {
  symbol: string;
  asks: { price: number; size: number }[];
  bids: { price: number; size: number }[];
};
