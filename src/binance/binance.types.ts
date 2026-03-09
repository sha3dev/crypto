export type BinanceStreamEnvelope = {
  stream?: string;
  data?: unknown;
};

export type BinanceAggTradeEnvelope = {
  E?: number;
  p?: string;
  q?: string;
  m?: boolean;
};

export type BinanceDepthEnvelope = {
  E?: number;
  asks?: [string, string][];
  bids?: [string, string][];
  a?: [string, string][];
  b?: [string, string][];
};
