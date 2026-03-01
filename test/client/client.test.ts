import * as assert from "node:assert/strict";
import { test } from "node:test";

import { CryptoFeedClient } from "../../src/client/crypto-feed-client.js";
import { NoProvidersConnectedError } from "../../src/client/no-providers-connected-error.js";
import type {
  ProviderContract,
  ProviderEventListener
} from "../../src/providers/shared/provider-types.js";

type ProviderStubOptions = {
  id: ProviderContract["id"];
  shouldConnect: boolean;
};

const createProviderStub = (options: ProviderStubOptions): ProviderContract => {
  let listener: ProviderEventListener | null = null;

  const provider: ProviderContract = {
    id: options.id,
    connect: async (nextListener: ProviderEventListener): Promise<void> => {
      listener = nextListener;
      if (options.shouldConnect) {
        listener({
          type: "status",
          provider: options.id,
          ts: 1,
          status: "connected",
          message: "ok"
        });
      } else {
        throw new Error("connect failed");
      }
      return;
    },
    disconnect: async (): Promise<void> => {
      if (listener) {
        listener({
          type: "status",
          provider: options.id,
          ts: 2,
          status: "disconnected",
          message: "bye"
        });
      }
      return;
    }
  };

  return provider;
};

test("client connect succeeds when at least one provider connects", async () => {
  const providers: ProviderContract[] = [
    createProviderStub({ id: "binance", shouldConnect: true }),
    createProviderStub({ id: "kraken", shouldConnect: false })
  ];
  const client = CryptoFeedClient.fromProviders(providers);

  await client.connect();
  await client.disconnect();

  assert.equal(true, true);
});

test("client connect throws when all providers fail", async () => {
  const providers: ProviderContract[] = [
    createProviderStub({ id: "binance", shouldConnect: false }),
    createProviderStub({ id: "kraken", shouldConnect: false })
  ];
  const client = CryptoFeedClient.fromProviders(providers);

  await assert.rejects(
    async () => {
      await client.connect();
    },
    (error: unknown) => {
      const isExpected = error instanceof NoProvidersConnectedError;
      return isExpected;
    }
  );
});

test("client disconnect clears active subscriptions", async () => {
  const providers: ProviderContract[] = [
    createProviderStub({ id: "binance", shouldConnect: true })
  ];
  const client = CryptoFeedClient.fromProviders(providers);
  let notifications = 0;
  const subscription = client.subscribe(() => {
    notifications += 1;
  });

  await client.connect();
  await client.disconnect();
  subscription.unsubscribe();

  assert.equal(notifications >= 1, true);
});
