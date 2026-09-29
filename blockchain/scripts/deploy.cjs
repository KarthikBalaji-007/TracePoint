const fs = require("fs");
const path = require("path");
const { ethers, network } = require("hardhat");

async function main() {
  const [deployer] = await ethers.getSigners();
  const deployerAddress = await deployer.getAddress();
  const provider = ethers.provider;
  const currentNetwork = await provider.getNetwork();

  console.log("Deploying TracePointAlerts...");
  console.log("Network name:", network.name);
  console.log("Chain ID:", currentNetwork.chainId.toString());
  console.log("Deployer public address:", deployerAddress);

  const balance = await provider.getBalance(deployerAddress);
  console.log("Deployer balance:", ethers.formatEther(balance), "tMSTC");

  if (balance === 0n && network.name !== "hardhat") {
    throw new Error(`Deployer ${deployerAddress} has 0 balance on ${network.name}.`);
  }

  const factory = await ethers.getContractFactory("TracePointAlerts", deployer);
  const contract = await factory.deploy();
  await contract.waitForDeployment();

  const contractAddress = await contract.getAddress();
  const deployTx = contract.deploymentTransaction();
  const deployReceipt = deployTx ? await deployTx.wait() : null;

  console.log("TracePointAlerts deployed to:", contractAddress);
  console.log("Deployment transaction hash:", deployTx ? deployTx.hash : "N/A");
  console.log("Block number:", deployReceipt ? deployReceipt.blockNumber : "N/A");

  const bridgeKeyWallet = process.env.BRIDGEKEY_WALLET_ADDRESS || "0x16d31843fbb39B683e280B8FD6cB7FFd7D7785d6";
  const roleNames = [
    "ALERT_PUBLISHER_ROLE",
    "ALERT_RESPONDER_ROLE",
    "ALERT_REVIEWER_ROLE",
    "ALERT_RESOLVER_ROLE",
  ];

  console.log(`Granting roles to BridgeKey wallet: ${bridgeKeyWallet}...`);
  const grantTxs = [];
  for (const name of roleNames) {
    const roleHash = ethers.keccak256(ethers.toUtf8Bytes(name));
    const tx = await contract.grantRole(roleHash, bridgeKeyWallet);
    const receipt = await tx.wait();
    grantTxs.push({ role: name, txHash: tx.hash, blockNumber: receipt.blockNumber });
    console.log(`Granted ${name} -> ${tx.hash}`);
  }

  if (deployerAddress.toLowerCase() !== bridgeKeyWallet.toLowerCase()) {
    console.log(`Granting roles to deployer: ${deployerAddress}...`);
    for (const name of roleNames) {
      const roleHash = ethers.keccak256(ethers.toUtf8Bytes(name));
      const tx = await contract.grantRole(roleHash, deployerAddress);
      await tx.wait();
    }
  }

  const deploymentData = {
    network: network.name,
    chainId: Number(currentNetwork.chainId),
    contractAddress,
    deploymentTxHash: deployTx ? deployTx.hash : null,
    blockNumber: deployReceipt ? deployReceipt.blockNumber : null,
    deployerAddress,
    bridgeKeyWallet,
    roleGrants: grantTxs,
    deployedAt: new Date().toISOString(),
  };

  const deploymentsDir = path.join(__dirname, "..", "deployments");
  if (!fs.existsSync(deploymentsDir)) fs.mkdirSync(deploymentsDir, { recursive: true });
  fs.writeFileSync(
    path.join(deploymentsDir, `${network.name}.json`),
    JSON.stringify(deploymentData, null, 2),
  );
  console.log("Saved deployment metadata to deployments/" + network.name + ".json");
}

main().catch((error) => {
  console.error("Deployment failed:", error);
  process.exitCode = 1;
});
