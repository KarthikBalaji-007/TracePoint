const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("TracePointAlerts", function () {
  async function setup() {
    const [admin, publisher, responder, reviewer] = await ethers.getSigners();
    const Factory = await ethers.getContractFactory("TracePointAlerts");
    const contract = await Factory.deploy();
    await contract.waitForDeployment();
    const role = async (name) => ethers.keccak256(ethers.toUtf8Bytes(name));
    await contract.grantRole(await role("ALERT_PUBLISHER_ROLE"), publisher.address);
    await contract.grantRole(await role("ALERT_RESPONDER_ROLE"), responder.address);
    await contract.grantRole(await role("ALERT_REVIEWER_ROLE"), reviewer.address);
    await contract.grantRole(await role("ALERT_RESOLVER_ROLE"), reviewer.address);
    const hash = (value) => ethers.keccak256(ethers.toUtf8Bytes(value));
    const alertId = hash("opaque-alert-test-1");
    const expiry = (await ethers.provider.getBlock("latest")).timestamp + 3600;
    await contract.connect(publisher).publishAlert(
      alertId, hash("coarse-jurisdiction"), hash("coarse-zone"), 0, 2,
      hash("model-v1"), hash("fusion-v1"), hash("salted-snapshot-commitment"),
      hash("opaque-offchain-reference"), expiry, expiry - 60,
    );
    return { contract, admin, publisher, responder, reviewer, alertId, expiry };
  }

  it("enforces roles and records a publish, acknowledge, commit, resolve lifecycle", async function () {
    const { contract, publisher, responder, reviewer, alertId, expiry } = await setup();
    await expect(contract.connect(responder).publishAlert(
      ethers.keccak256(ethers.toUtf8Bytes("other")), ...[
        ethers.ZeroHash, ethers.ZeroHash, 0, 0, ethers.ZeroHash, ethers.ZeroHash,
        ethers.ZeroHash, ethers.ZeroHash, expiry, 0,
      ],
    )).to.be.reverted;
    expect((await contract.getAlert(alertId)).state).to.equal(1);
    await contract.connect(responder).acknowledge(alertId);
    await contract.connect(responder).commitResponse(alertId, expiry - 120, 1);
    await contract.connect(reviewer).resolve(alertId, 2);
    expect((await contract.getAlert(alertId)).state).to.equal(4);
    expect(publisher.address).to.not.equal(responder.address);
  });

  it("allows disputes from published/acknowledged and a reviewer resolution", async function () {
    const { contract, reviewer, alertId } = await setup();
    await contract.connect(reviewer).dispute(alertId, 3);
    await contract.connect(reviewer).resolve(alertId, 4);
    expect((await contract.getAlert(alertId)).state).to.equal(4);
  });

  it("expires committed and disputed alerts at their permitted deadline", async function () {
    const first = await setup();
    await first.contract.connect(first.responder).acknowledge(first.alertId);
    const responseDeadline = first.expiry - 120;
    await first.contract.connect(first.responder).commitResponse(first.alertId, responseDeadline, 1);
    await ethers.provider.send("evm_setNextBlockTimestamp", [responseDeadline]);
    await ethers.provider.send("evm_mine", []);
    await first.contract.expire(first.alertId);
    expect((await first.contract.getAlert(first.alertId)).state).to.equal(5);

    const second = await setup();
    await second.contract.connect(second.reviewer).dispute(second.alertId, 2);
    await ethers.provider.send("evm_setNextBlockTimestamp", [second.expiry]);
    await ethers.provider.send("evm_mine", []);
    await second.contract.expire(second.alertId);
    expect((await second.contract.getAlert(second.alertId)).state).to.equal(5);
  });

  it("expires published alerts only after expiry", async function () {
    const { contract, alertId, expiry } = await setup();
    await expect(contract.expire(alertId)).to.be.reverted;
    await ethers.provider.send("evm_setNextBlockTimestamp", [expiry]);
    await ethers.provider.send("evm_mine", []);
    await contract.expire(alertId);
    expect((await contract.getAlert(alertId)).state).to.equal(5);
  });

  it("rejects duplicate alert IDs and emits minimal state transitions", async function () {
    const { contract, publisher, responder, alertId, expiry } = await setup();
    await expect(contract.connect(publisher).publishAlert(
      alertId, ethers.ZeroHash, ethers.ZeroHash, 0, 0, ethers.ZeroHash, ethers.ZeroHash,
      ethers.ZeroHash, ethers.ZeroHash, expiry, 0,
    )).to.be.reverted;
    await expect(contract.connect(publisher).acknowledge(alertId)).to.be.reverted;
    await expect(contract.connect(responder).acknowledge(alertId)).to.emit(contract, "AlertTransition");
  });
});
