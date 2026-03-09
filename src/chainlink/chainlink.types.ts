export type ChainlinkEnvelope = {
  topic?: string;
  type?: string;
  timestamp?: number;
  payload?: {
    symbol?: string;
    timestamp?: number;
    value?: number;
  };
  message?: string;
};
