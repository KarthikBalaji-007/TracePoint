const fs = require("fs");
const path = require("path");
const { ethers } = require("ethers");

// Load .env
const envPath = path.join(__dirname, "..", ".env");
if (fs.existsSync(envPath)) {
  const content = fs.readFileSync(envPath, "utf-8");
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith("#") && trimmed.includes("=")) {
      const [key, ...vals] = trimmed.split("=");
      const val = vals.join("=").trim().replace(/^["']|["']$/g, "");
      if (key && !process.env[key.trim()]) process.env[key.trim()] = val;
    }
  }
}

const rpcUrl = process.env.MST_RPC_URL || "https://testnetrpc.mstblockchain.com";
const chainId = Number(process.env.MST_CHAIN_ID || 91562037);
const privateKey = process.env.MST_DEPLOYER_KEY;

if (!privateKey) {
  console.error("MST_DEPLOYER_KEY not found in .env");
  process.exit(1);
}

const deploymentPath = path.join(__dirname, "..", "deployments", "mstTestnet.json");
if (!fs.existsSync(deploymentPath)) {
  console.error("Deployment file mstTestnet.json not found");
  process.exit(1);
}
const deployment = JSON.parse(fs.readFileSync(deploymentPath, "utf-8"));
const contractAddress = deployment.contractAddress;

const alertAbi = [
  "function publishAlert(bytes32 alertId,bytes32 jurisdictionId,bytes32 zoneId,uint8 horizon,uint8 riskBand,bytes32 modelVersion,bytes32 fusionVersion,bytes32 snapshotCommitment,bytes32 offchainRef,uint64 expiry,uint64 responseDeadline)",
  "function acknowledge(bytes32 alertId)",
  "function commitResponse(bytes32 alertId,uint64 responseDeadline,uint8 coarseCode)",
  "function resolve(bytes32 alertId,uint8 coarseCode)",
  "function dispute(bytes32 alertId,uint8 coarseCode)",
  "function expire(bytes32 alertId)",
  "function getAlert(bytes32 alertId) view returns (tuple(bytes32 jurisdictionId,bytes32 zoneId,bytes32 snapshotCommitment,bytes32 offchainRef,bytes32 modelVersion,bytes32 fusionVersion,address publisher,address acknowledger,address responder,uint64 publishedAt,uint64 expiry,uint64 responseDeadline,uint8 horizon,uint8 riskBand,uint8 state))",
  "event AlertPublished(bytes32 indexed alertId,address indexed publisher,bytes32 indexed zoneId,bytes32 jurisdictionId,uint8 horizon,uint8 riskBand,bytes32 modelVersion,bytes32 fusionVersion,bytes32 snapshotCommitment,bytes32 offchainRef,uint64 expiry)",
  "event AlertTransition(bytes32 indexed alertId,uint8 indexed fromState,uint8 indexed toState,address actor,uint8 coarseCode,uint64 occurredAt)",
];

async function main() {
  console.log("=== TRACEPOINT REAL MST TESTNET LIFECYCLE TEST ===");
  console.log("RPC:", rpcUrl);
  console.log("Chain ID:", chainId);
  console.log("Contract Address:", contractAddress);

  const provider = new ethers.JsonRpcProvider(rpcUrl, { chainId, name: "mst-testnet" });
  const wallet = new ethers.Wallet(privateKey, provider);
  console.log("Operator Address:", wallet.address);

  const balance = await provider.getBalance(wallet.address);
  console.log("Operator Balance:", ethers.formatEther(balance), "tMSTC");

  const contract = new ethers.Contract(contractAddress, alertAbi, wallet);

  // 1. Prepare synthetic demo alert parameters
  const testId = "ALT-" + Date.now();
  const alertId = ethers.keccak256(ethers.toUtf8Bytes(testId));
  const jurisdictionId = ethers.keccak256(ethers.toUtf8Bytes("SYN-JUR-01"));
  const zoneId = ethers.keccak256(ethers.toUtf8Bytes("SYN-ZONE-001"));
  const horizon = 0; // +2h
  const riskBand = 2; // HIGH
  const modelVersion = ethers.keccak256(ethers.toUtf8Bytes("baseline-v1.0"));
  const fusionVersion = ethers.keccak256(ethers.toUtf8Bytes("fusion-ruleset-v1.0"));

  // Salted snapshot commitment (off-chain commitment)
  const salt = ethers.randomBytes(32);
  const snapshotData = JSON.stringify({ predictionId: "PRED-" + Date.now(), score: 0.85 });
  const snapshotCommitment = ethers.keccak256(ethers.concat([ethers.toUtf8Bytes(snapshotData), salt]));
  const offchainRef = ethers.keccak256(ethers.toUtf8Bytes("tracepoint-demo-" + testId));

  const currentBlock = await provider.getBlock("latest");
  const now = currentBlock.timestamp;
  const expiry = now + 86400; // +24 hours
  const responseDeadline = now + 7200; // +2 hours

  console.log("\n[1/4] Publishing Alert to MST Testnet...");
  console.log("Opaque Alert ID:", alertId);
  const pubTx = await contract.publishAlert(
    alertId, jurisdictionId, zoneId, horizon, riskBand,
    modelVersion, fusionVersion, snapshotCommitment, offchainRef,
    expiry, responseDeadline
  );
  console.log("Publish TX Broadcast:", pubTx.hash);
  const pubReceipt = await pubTx.wait();
  console.log("Publish Confirmed in Block:", pubReceipt.blockNumber);

  let alertData = await contract.getAlert(alertId);
  console.log("On-chain State after Publish:", alertData.state.toString(), "(1 = PUBLISHED)");
  if (Number(alertData.state) !== 1) throw new Error("Expected state 1 (PUBLISHED)");

  console.log("\n[2/4] Acknowledging Alert on MST Testnet...");
  const ackTx = await contract.acknowledge(alertId);
  console.log("Acknowledge TX Broadcast:", ackTx.hash);
  const ackReceipt = await ackTx.wait();
  console.log("Acknowledge Confirmed in Block:", ackReceipt.blockNumber);

  alertData = await contract.getAlert(alertId);
  console.log("On-chain State after Acknowledge:", alertData.state.toString(), "(2 = ACKNOWLEDGED)");
  if (Number(alertData.state) !== 2) throw new Error("Expected state 2 (ACKNOWLEDGED)");

  console.log("\n[3/4] Committing Action on MST Testnet...");
  const newDeadline = now + 3600;
  const coarseActionCode = 1; // dispatched review
  const commitTx = await contract.commitResponse(alertId, newDeadline, coarseActionCode);
  console.log("Commit Response TX Broadcast:", commitTx.hash);
  const commitReceipt = await commitTx.wait();
  console.log("Commit Response Confirmed in Block:", commitReceipt.blockNumber);

  alertData = await contract.getAlert(alertId);
  console.log("On-chain State after Commit:", alertData.state.toString(), "(3 = ACTION_COMMITTED)");
  if (Number(alertData.state) !== 3) throw new Error("Expected state 3 (ACTION_COMMITTED)");

  console.log("\n[4/4] Resolving Alert on MST Testnet...");
  const coarseResolutionCode = 2; // resolved: interdicted
  const resolveTx = await contract.resolve(alertId, coarseResolutionCode);
  console.log("Resolve TX Broadcast:", resolveTx.hash);
  const resolveReceipt = await resolveTx.wait();
  console.log("Resolve Confirmed in Block:", resolveReceipt.blockNumber);

  alertData = await contract.getAlert(alertId);
  console.log("On-chain State after Resolve:", alertData.state.toString(), "(4 = RESOLVED)");
  if (Number(alertData.state) !== 4) throw new Error("Expected state 4 (RESOLVED)");

  console.log("\n[Indexer Test] Querying MST Testnet events...");
  const readContract = new ethers.Contract(contractAddress, alertAbi, provider);
  const publishEvents = await readContract.queryFilter(readContract.filters.AlertPublished(alertId));
  console.log("Found AlertPublished events:", publishEvents.length);
  if (publishEvents.length > 0) {
    console.log("  Event Alert ID:", publishEvents[0].args.alertId);
    console.log("  Event Publisher:", publishEvents[0].args.publisher);
    console.log("  Event TX:", publishEvents[0].transactionHash);
  }

  const transitionEvents = await readContract.queryFilter(readContract.filters.AlertTransition(alertId));
  console.log("Found AlertTransition events:", transitionEvents.length);
  transitionEvents.forEach((ev, i) => {
    console.log(`  Transition [${i+1}]: ${ev.args.fromState} -> ${ev.args.toState} by ${ev.args.actor} (tx: ${ev.transactionHash})`);
  });

  const lifecycleResults = {
    contractAddress,
    testAlertId: testId,
    opaqueAlertId: alertId,
    publishTx: pubTx.hash,
    publishBlock: pubReceipt.blockNumber,
    acknowledgeTx: ackTx.hash,
    acknowledgeBlock: ackReceipt.blockNumber,
    actionCommitmentTx: commitTx.hash,
    actionCommitmentBlock: commitReceipt.blockNumber,
    resolveTx: resolveTx.hash,
    resolveBlock: resolveReceipt.blockNumber,
    finalState: "RESOLVED",
    explorerUrl: "https://testnet.mstscan.com",
    executedAt: new Date().toISOString()
  };

  const resultsPath = path.join(__dirname, "..", "deployments", "lifecycle_results.json");
  fs.writeFileSync(resultsPath, JSON.stringify(lifecycleResults, null, 2));
  console.log("\nSaved lifecycle results to", resultsPath);
  console.log("\nALL 4 ON-CHAIN MST TESTNET LIFECYCLE TRANSITIONS SUCCEEDED!");
}

main().catch((err) => {
  console.error("Lifecycle test failed:", err);
  process.exit(1);
});
