import type { DemoAlert } from "../../types";

export type MockRole = "INVESTIGATOR" | "RESPONDER" | "REVIEWER";

const terminalStates = new Set(["RESOLVED", "EXPIRED"]);

/** Session-local lifecycle simulator. It never creates chain addresses or transaction hashes. */
export class MockAlertWorkflowAdapter {
  advance(alert: DemoAlert, role: MockRole, now = new Date()): DemoAlert {
    const next = { ...alert };
    if (next.state === "DRAFT") {
      this.requireRole(role, "INVESTIGATOR");
      next.state = "PUBLISHED";
      next.expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();
    } else if (next.state === "PUBLISHED") {
      this.requireRole(role, "RESPONDER");
      next.state = "ACKNOWLEDGED";
    } else if (next.state === "ACKNOWLEDGED") {
      this.requireRole(role, "RESPONDER");
      next.state = "ACTION_COMMITTED";
      next.responseDeadline = new Date(now.getTime() + 60 * 60 * 1000).toISOString();
    } else if (next.state === "ACTION_COMMITTED" || next.state === "DISPUTED") {
      this.requireRole(role, "REVIEWER");
      next.state = "RESOLVED";
    } else {
      throw new Error(`No mock transition is available from ${next.state}.`);
    }
    return next;
  }

  dispute(alert: DemoAlert, role: MockRole = "REVIEWER"): DemoAlert {
    this.requireRole(role, "REVIEWER");
    if (alert.state !== "PUBLISHED" && alert.state !== "ACKNOWLEDGED") {
      throw new Error(`An alert in ${alert.state} cannot be disputed.`);
    }
    return { ...alert, state: "DISPUTED" };
  }

  expire(alert: DemoAlert, role: MockRole = "REVIEWER"): DemoAlert {
    this.requireRole(role, "REVIEWER");
    if (!["PUBLISHED", "ACTION_COMMITTED", "DISPUTED"].includes(alert.state)) {
      throw new Error(`An alert in ${alert.state} cannot be expired.`);
    }
    return { ...alert, state: "EXPIRED" };
  }

  private requireRole(actual: MockRole, expected: MockRole) {
    if (actual !== expected) throw new Error(`${expected} role required for this mock transition.`);
  }
}

export function mockStateIsTerminal(state: DemoAlert["state"]): boolean {
  return terminalStates.has(state);
}
