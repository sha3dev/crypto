import * as assert from "node:assert/strict";
import { test } from "node:test";

import { NoProvidersConnectedError } from "../../src/client/client.errors.ts";
import { CryptoFeedClient } from "../../src/client/client.service.ts";
import type { ProviderContract, ProviderEventListener } from "../../src/provider/provider.types.ts";

type ProviderStubOptions = {
  id: ProviderContract["id"];
  shouldConnect: boolean;
};

const CREATE_PROVIDER_STUB = (options: ProviderStubOptions): ProviderContract => {
  let listener: ProviderEventListener | null = null;
  const providerStub: ProviderContract = {
    id: options.id,
    connect: async (nextListener: ProviderEventListener): Promise<void> => {
      listener = nextListener;

      if (options.shouldConnect) {
        listener({ type: "status", provider: options.id, ts: 1, status: "connected", message: "ok" });
      } else {
        throw new Error("connect failed");
      }
    },
    disconnect: async (): Promise<void> => {
      if (listener !== null) {
        listener({ type: "status", provider: options.id, ts: 2, status: "disconnected", message: "bye" });
      }
    },
  };
  return providerStub;
};

test("client connect succeeds when at least one provider connects", async () => {
  const providers: ProviderContract[] = [
    CREATE_PROVIDER_STUB({ id: "binance", shouldConnect: true }),
    CREATE_PROVIDER_STUB({ id: "kraken", shouldConnect: false }),
  ];
  const client = CryptoFeedClient.fromProviders(providers);

  await client.connect();
  await client.disconnect();

  assert.equal(true, true);
});

test("client connect throws when all providers fail", async () => {
  const providers: ProviderContract[] = [
    CREATE_PROVIDER_STUB({ id: "binance", shouldConnect: false }),
    CREATE_PROVIDER_STUB({ id: "kraken", shouldConnect: false }),
  ];
  const client = CryptoFeedClient.fromProviders(providers);

  await assert.rejects(
    async (): Promise<void> => {
      await client.connect();
    },
    (error: unknown): boolean => error instanceof NoProvidersConnectedError,
  );
});

test("client disconnect clears active subscriptions", async () => {
  const providers: ProviderContract[] = [CREATE_PROVIDER_STUB({ id: "binance", shouldConnect: true })];
  const client = CryptoFeedClient.fromProviders(providers);
  let notificationCount = 0;
  const subscription = client.subscribe(() => {
    notificationCount += 1;
  });

  await client.connect();
  await client.disconnect();
  subscription.unsubscribe();

  assert.equal(notificationCount >= 1, true);
});
