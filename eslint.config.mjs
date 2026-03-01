import nodeConfig from "@sha3/code-standards/eslint/node";
import testConfig from "@sha3/code-standards/eslint/test";

const ignoreConfig = {
  ignores: ["dist/**"]
};

export default [ignoreConfig, ...nodeConfig, ...testConfig];
