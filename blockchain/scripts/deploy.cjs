const { ethers } = require("hardhat");

async function main() {
  const [deployer] = await ethers.getSigners();
  const factory = await ethers.getContractFactory("TracePointAlerts", deployer);
  const contract = await factory.deploy();
  await contract.waitForDeployment();
  console.log("TracePointAlerts deployed by", await deployer.getAddress());
  console.log("TracePointAlerts address", await contract.getAddress());
  console.log("Grant application roles through the admin after verifying actor wallets.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
