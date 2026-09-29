require("@nomicfoundation/hardhat-ethers");
require("@nomicfoundation/hardhat-chai-matchers");
const { subtask } = require("hardhat/config");
const { TASK_COMPILE_SOLIDITY_GET_SOLC_BUILD } = require("hardhat/builtin-tasks/task-names");

subtask(TASK_COMPILE_SOLIDITY_GET_SOLC_BUILD).setAction(async ({ solcVersion }, _hre, runSuper) => {
  if (solcVersion !== "0.8.24") return runSuper();
  const solc = require("solc");
  return {
    compilerPath: require.resolve("solc/soljson.js"),
    isSolcJs: true,
    version: solcVersion,
    longVersion: solc.version(),
  };
});

const fs = require("fs");
const path = require("path");
const envPath = path.join(__dirname, ".env");
if (fs.existsSync(envPath)) {
  const content = fs.readFileSync(envPath, "utf-8");
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith("#") && trimmed.includes("=")) {
      const [key, ...vals] = trimmed.split("=");
      const val = vals.join("=").trim().replace(/^["']|["']$/g, "");
      if (key && !process.env[key.trim()]) {
        process.env[key.trim()] = val;
      }
    }
  }
}

const networks = { hardhat: { chainId: 31337 } };
if (process.env.MST_NETWORK_MODE === "testnet") {
  const rpcUrl = process.env.MST_RPC_URL || "https://testnetrpc.mstblockchain.com";
  const chainId = Number(process.env.MST_CHAIN_ID || 91562037);
  if (!rpcUrl || !Number.isSafeInteger(chainId) || chainId <= 0) {
    throw new Error("MST testnet mode requires MST_RPC_URL and verified MST_CHAIN_ID");
  }
  const accounts = process.env.MST_DEPLOYER_KEY ? [process.env.MST_DEPLOYER_KEY] : undefined;
  networks.mstTestnet = { url: rpcUrl, chainId, accounts };
}

module.exports = {
  solidity: {
    version: "0.8.24",
    settings: { evmVersion: "cancun", optimizer: { enabled: true, runs: 200 } },
  },
  networks,
  paths: { sources: "./contracts", tests: "./test", cache: "./cache", artifacts: "./artifacts" },
};
