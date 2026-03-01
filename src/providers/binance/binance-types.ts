export type BinanceStreamEnvelope = {
  stream?: string;
  data?: unknown;
};

export type BinanceAggTrade = {
  E?: number;
  p?: string;
  q?: string;
  m?: boolean;
};

export type BinanceDepth = {
  E?: number;
  asks?: [string, string][];
  bids?: [string, string][];
  a?: [string, string][];
  b?: [string, string][];
};
