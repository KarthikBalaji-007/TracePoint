import {
  BrowserProvider,
  Contract,
  JsonRpcProvider,
  type JsonRpcSigner,
  concat,
  hexlify,
  keccak256,
  randomBytes,
  toUtf8Bytes,
} from "ethers";
import type { DemoAlert } from "../../types";

export type ChainMode = "mock" | "testnet";

export interface MstChainConfig {
  mode: ChainMode;
  rpcUrl?: string;
  chainId?: bigint;
  contractAddress?: string;
  explorerUrl?: string;
}

export function resolveMstChainConfig(env: Record<string, string | undefined>): MstChainConfig {
  const mode = (env.VITE_TRACEPOINT_CHAIN_MODE ?? "mock") as ChainMode;
  if (mode === "mock") return { mode };
  if (mode !== "testnet") throw new Error("VITE_TRACEPOINT_CHAIN_MODE must be mock or testnet.");
  const rpcUrl = env.VITE_MST_RPC_URL;
  const chainIdText = env.VITE_MST_CHAIN_ID;
  const contractAddress = env.VITE_MST_ALERTS_CONTRACT_ADDRESS;
  const explorerUrl = env.VITE_MST_EXPLORER_URL ?? "https://testnet.mstscan.com";
  if (!rpcUrl || !chainIdText || !contractAddress) {
    throw new Error("MST testnet mode requires VITE_MST_RPC_URL, VITE_MST_CHAIN_ID, and VITE_MST_ALERTS_CONTRACT_ADDRESS.");
  }
  const chainId = BigInt(chainIdText);
  if (chainId <= 0n || !/^0x[\da-fA-F]{40}$/.test(contractAddress)) {
    throw new Error("MST chain ID or contract address is invalid.");
  }
  const url = new URL(rpcUrl);
  if (url.protocol !== "https:" && !(url.protocol === "http:" && ["127.0.0.1", "localhost"].includes(url.hostname))) {
    throw new Error("MST RPC must use HTTPS, except for a local development node.");
  }
  return { mode, rpcUrl, chainId, contractAddress, explorerUrl };
}

export type Eip1193Provider = {
  request(args: { method: string; params?: readonly unknown[] | object }): Promise<unknown>;
};

export function getInjectedProvider(): Eip1193Provider | null {
  if (typeof window === "undefined") return null;
  const win = window as unknown as { ethereum?: Eip1193Provider; bridgekey?: Eip1193Provider };
  return win.bridgekey ?? win.ethereum ?? null;
}

export interface BridgeKeySigningInterface {
  connect(expectedChainId: bigint): Promise<string>;
  sendTransaction(to: string, data: string): Promise<string>;
  getAddress(): string | null;
}

/** Uses the standard injected EVM provider protocol; no BridgeKey-specific secret is assumed. */
export class BridgeKeySigner implements BridgeKeySigningInterface {
  private address: string | null = null;
  private signer: JsonRpcSigner | null = null;
  private provider: BrowserProvider;
  private readonly rawProvider: Eip1193Provider;

  constructor(injectedProvider: Eip1193Provider) {
    this.rawProvider = injectedProvider;
    this.provider = new BrowserProvider(injectedProvider as never);
  }

  getAddress(): string | null {
    return this.address;
  }

  async connect(expectedChainId: bigint): Promise<string> {
    const rawChainId = (await this.rawProvider.request({ method: "eth_chainId" })) as string;
    const currentChainId = BigInt(rawChainId);
    if (currentChainId !== expectedChainId) {
      await this.ensureNetwork(expectedChainId);
      this.provider = new BrowserProvider(this.rawProvider as never);
    }
    const accounts = (await this.rawProvider.request({ method: "eth_requestAccounts" })) as string[];
    if (!accounts.length) throw new Error("The wallet did not authorize an account.");
    this.signer = await this.provider.getSigner(accounts[0]);
    this.address = await this.signer.getAddress();
    return this.address;
  }

  async ensureNetwork(expectedChainId: bigint): Promise<void> {
    const hexChainId = `0x${expectedChainId.toString(16)}`;
    try {
      await this.rawProvider.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: hexChainId }],
      });
    } catch (switchError: unknown) {
      const code = (switchError as { code?: number })?.code;
      if (code === 4902) {
        await this.rawProvider.request({
          method: "wallet_addEthereumChain",
          params: [
            {
              chainId: hexChainId,
              chainName: "MST Testnet",
              rpcUrls: ["https://testnetrpc.mstblockchain.com"],
              nativeCurrency: { name: "tMSTC", symbol: "tMSTC", decimals: 18 },
              blockExplorerUrls: ["https://testnet.mstscan.com"],
            },
          ],
        });
      } else {
        throw new Error(
          `Please switch your BridgeKey wallet network to MST Testnet (Chain ID: ${expectedChainId.toString()}).`
        );
      }
    }
    const rawAfter = (await this.rawProvider.request({ method: "eth_chainId" })) as string;
    if (BigInt(rawAfter) !== expectedChainId) {
      throw new Error(`Wallet is connected to chain ${BigInt(rawAfter)}; expected ${expectedChainId}.`);
    }
  }

  getTransactionSigner(): JsonRpcSigner {
    if (!this.signer) throw new Error("Connect the wallet before requesting a signature.");
    return this.signer;
  }

  async sendTransaction(to: string, data: string): Promise<string> {
    if (!this.address) throw new Error("Connect the wallet before requesting a signature.");
    const sent = await this.getTransactionSigner().sendTransaction({ to, data });
    return sent.hash;
  }
}

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

const bytes32Of = (text: string) => keccak256(toUtf8Bytes(text));
const bandCode: Record<NonNullable<DemoAlert["riskBand"]>, number> = { LOW: 0, MEDIUM: 1, HIGH: 2, CRITICAL: 3 };
const horizonCode: Record<DemoAlert["horizon"], number> = { "+2h": 0, "+6h": 1, "+24h": 2 };

export interface PublishCommitments {
  jurisdictionId: string;
  snapshotCommitment: string;
  offchainRef: string;
  expiry: number;
  responseDeadline: number;
}

/** Publishes only coarse identifiers, versions, bands, expiry, and salted opaque references. */
export class MstAlertAdapter {
  private readonly contract: Contract;
  private readonly readContract: Contract;

  constructor(config: MstChainConfig, signer: BridgeKeySigner) {
    if (config.mode !== "testnet" || !config.contractAddress || !config.chainId || !config.rpcUrl) {
      throw new Error("MST adapter requires complete testnet configuration.");
    }
    this.contract = new Contract(config.contractAddress, alertAbi, signer.getTransactionSigner());
    const provider = new JsonRpcProvider(config.rpcUrl, {
      chainId: Number(config.chainId),
      name: "mst-testnet",
    });
    this.readContract = new Contract(config.contractAddress, alertAbi, provider);
  }

  async publish(alert: DemoAlert, commitments: PublishCommitments): Promise<string> {
    if (!alert.riskBand) throw new Error("An unbanded prediction cannot be published.");
    const tx = await this.contract.publishAlert(
      bytes32Of(alert.alertId),
      bytes32Of(commitments.jurisdictionId),
      bytes32Of(alert.zoneId),
      horizonCode[alert.horizon],
      bandCode[alert.riskBand],
      bytes32Of(alert.modelVersion),
      bytes32Of(alert.fusionVersion),
      commitments.snapshotCommitment,
      commitments.offchainRef,
      commitments.expiry,
      commitments.responseDeadline
    );
    await tx.wait();
    return (tx as { hash: string }).hash;
  }

  async acknowledge(alertId: string): Promise<string> {
    const tx = await this.contract.acknowledge(bytes32Of(alertId));
    await tx.wait();
    return tx.hash;
  }

  async commitResponse(alertId: string, responseDeadline: number, coarseCode: number): Promise<string> {
    const tx = await this.contract.commitResponse(bytes32Of(alertId), responseDeadline, coarseCode);
    await tx.wait();
    return tx.hash;
  }

  async resolve(alertId: string, coarseCode: number): Promise<string> {
    const tx = await this.contract.resolve(bytes32Of(alertId), coarseCode);
    await tx.wait();
    return tx.hash;
  }

  async dispute(alertId: string, coarseCode: number): Promise<string> {
    const tx = await this.contract.dispute(bytes32Of(alertId), coarseCode);
    await tx.wait();
    return tx.hash;
  }

  async expire(alertId: string): Promise<string> {
    const tx = await this.contract.expire(bytes32Of(alertId));
    await tx.wait();
    return tx.hash;
  }

  async getAlert(alertId: string): Promise<unknown> {
    return this.readContract.getAlert(bytes32Of(alertId));
  }
}

export function createSnapshotCommitment(canonicalSnapshot: string): { commitment: string; nonce: string } {
  const nonce = randomBytes(32);
  return { commitment: keccak256(concat([toUtf8Bytes(canonicalSnapshot), nonce])), nonce: hexlify(nonce) };
}

export interface IndexedTransition {
  alertId: string;
  fromState: number;
  toState: number;
  actor: string;
  coarseCode: number;
  occurredAt: number;
  transactionHash: string;
  blockNumber: number;
}

export interface IndexedAlertPublish {
  alertId: string;
  publisher: string;
  zoneId: string;
  jurisdictionId: string;
  horizon: number;
  riskBand: number;
  modelVersion: string;
  fusionVersion: string;
  snapshotCommitment: string;
  offchainRef: string;
  expiry: number;
  transactionHash: string;
  blockNumber: number;
}

export interface AlertChainIndexer {
  published(fromBlock?: number): Promise<IndexedAlertPublish[]>;
  transitions(fromBlock?: number): Promise<IndexedTransition[]>;
  getAlert(alertId: string): Promise<unknown>;
}

export class MstRpcAlertIndexer implements AlertChainIndexer {
  private readonly provider: JsonRpcProvider;
  private readonly contract: Contract;

  constructor(config: MstChainConfig) {
    if (config.mode !== "testnet" || !config.rpcUrl || !config.contractAddress || !config.chainId) {
      throw new Error("MST indexer requires complete testnet configuration.");
    }
    this.provider = new JsonRpcProvider(config.rpcUrl, { chainId: Number(config.chainId), name: "mst-testnet" });
    this.contract = new Contract(config.contractAddress, alertAbi, this.provider);
  }

  async published(fromBlock = 0): Promise<IndexedAlertPublish[]> {
    const logs = await this.contract.queryFilter(this.contract.filters.AlertPublished(), fromBlock);
    return logs.map((log) => {
      const args = (log as { args: Record<string, unknown> }).args;
      return {
        alertId: String(args.alertId),
        publisher: String(args.publisher),
        zoneId: String(args.zoneId),
        jurisdictionId: String(args.jurisdictionId),
        horizon: Number(args.horizon),
        riskBand: Number(args.riskBand),
        modelVersion: String(args.modelVersion),
        fusionVersion: String(args.fusionVersion),
        snapshotCommitment: String(args.snapshotCommitment),
        offchainRef: String(args.offchainRef),
        expiry: Number(args.expiry),
        transactionHash: log.transactionHash,
        blockNumber: log.blockNumber,
      };
    });
  }

  async transitions(fromBlock = 0): Promise<IndexedTransition[]> {
    const logs = await this.contract.queryFilter(this.contract.filters.AlertTransition(), fromBlock);
    return logs.map((log) => {
      const args = (log as { args: Record<string, unknown> }).args;
      return {
        alertId: String(args.alertId),
        fromState: Number(args.fromState),
        toState: Number(args.toState),
        actor: String(args.actor),
        coarseCode: Number(args.coarseCode),
        occurredAt: Number(args.occurredAt),
        transactionHash: log.transactionHash,
        blockNumber: log.blockNumber,
      };
    });
  }

  async getAlert(alertId: string): Promise<unknown> {
    return this.contract.getAlert(bytes32Of(alertId));
  }
}

export const alertContractInterface = alertAbi;

export const ON_CHAIN_STATES: Record<number, DemoAlert["state"]> = {
  1: "PUBLISHED",
  2: "ACKNOWLEDGED",
  3: "ACTION_COMMITTED",
  4: "RESOLVED",
  5: "EXPIRED",
  6: "DISPUTED",
};

export async function connectMstAlertAdapter(
  config: MstChainConfig,
  injectedProvider: Eip1193Provider
): Promise<{ signer: BridgeKeySigner; adapter: MstAlertAdapter; account: string }> {
  if (config.mode !== "testnet" || !config.chainId) throw new Error("Testnet chain configuration is required.");
  const signer = new BridgeKeySigner(injectedProvider);
  const account = await signer.connect(config.chainId);
  return { signer, adapter: new MstAlertAdapter(config, signer), account };
}
