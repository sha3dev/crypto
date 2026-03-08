import * as assert from "node:assert/strict";
import { test } from "node:test";

import { CryptoFeedClient } from "../src/index.ts";

test("package exports CryptoFeedClient class", () => {
  const hasCreate = typeof CryptoFeedClient.create === "function";
  assert.equal(hasCreate, true);
});
