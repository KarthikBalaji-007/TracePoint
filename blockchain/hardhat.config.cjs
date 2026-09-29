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

const networks = { hardhat: { chainId: 31337 } };
if (process.env.MST_NETWORK_MODE === "testnet") {
  const rpcUrl = process.env.MST_RPC_URL;
  const chainId = Number(process.env.MST_CHAIN_ID);
  if (!rpcUrl || !Number.isSafeInteger(chainId) || chainId <= 0) {
    throw new Error("MST testnet mode requires MST_RPC_URL and verified MST_CHAIN_ID");
  }
  networks.mstTestnet = { url: rpcUrl, chainId };
}

module.exports = {
  solidity: {
    version: "0.8.24",
    settings: { evmVersion: "cancun", optimizer: { enabled: true, runs: 200 } },
  },
  networks,
  paths: { sources: "./contracts", tests: "./test", cache: "./cache", artifacts: "./artifacts" },
};
