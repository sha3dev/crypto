import Logger from "@sha3/logger";

const packageName = "@sha3/crypto";
const loggerName = packageName.startsWith("@") ? packageName.split("/")[1] || packageName : packageName;
const LOGGER = new Logger({ loggerName });

export default LOGGER;
