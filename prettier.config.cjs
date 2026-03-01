let config;

try {
  config = require("@sha3/code-standards/prettier");
} catch {
  config = require("../../prettier/index.cjs");
}

module.exports = config;
