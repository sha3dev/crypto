export type OkxEnvelope = {
  arg?: {
    channel?: string;
    instId?: string;
  };
  data?: Array<Record<string, unknown>>;
};
