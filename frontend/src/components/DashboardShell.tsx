import {
  Activity,
  BellRing,
  Crosshair,
  FileSearch,
  Radar,
  ShieldAlert,
  Terminal,
} from "lucide-react";
import type { ReactNode } from "react";

export type WorkspaceType =
  | "overview"
  | "risk-map"
  | "investigation"
  | "alert-workflow"
  | "activity"
  | "demo-console";

interface NavigationItem {
  id: WorkspaceType;
  label: string;
  Icon: typeof Radar;
  badge?: string;
}

const navigation: NavigationItem[] = [
  { id: "overview", label: "Overview", Icon: Radar },
  { id: "risk-map", label: "Risk Map", Icon: Crosshair, badge: "SPATIAL" },
  { id: "investigation", label: "Investigation", Icon: FileSearch },
  { id: "alert-workflow", label: "Alert Workflow", Icon: BellRing },
  { id: "activity", label: "Activity", Icon: Activity },
  { id: "demo-console", label: "Demo Console", Icon: Terminal, badge: "TEST" },
];

export function DashboardShell({
  activeWorkspace,
  onSelectWorkspace,
  chainMode = "mock",
  children,
}: {
  activeWorkspace: WorkspaceType;
  onSelectWorkspace: (id: WorkspaceType) => void;
  chainMode?: "mock" | "testnet";
  walletAddress?: string | null;
  systemHealth?: "ok" | "degraded" | "error";
  children: ReactNode;
}) {
  return (
    <div className="app-shell">
      {/* Persistent Left Sidebar */}
      <aside className="sidebar" aria-label="Main sidebar">
        <div className="brand" onClick={() => onSelectWorkspace("overview")} role="button" tabIndex={0}>
          <span className="brand-mark">
            <Crosshair size={20} />
          </span>
          <div className="brand-text">
            <strong>TracePoint</strong>
            <small>DECISION INTELLIGENCE</small>
          </div>
        </div>

        <div className="sidebar-section-label">COMMAND WORKSPACES</div>
        <nav className="side-nav" aria-label="Workspace navigation">
          {navigation.map(({ id, label, Icon, badge }) => {
            const isActive = activeWorkspace === id;
            return (
              <button
                key={id}
                type="button"
                className={`nav-button ${isActive ? "nav-active" : ""}`}
                onClick={() => onSelectWorkspace(id)}
                aria-current={isActive ? "page" : undefined}
              >
                <Icon size={16} />
                <span>{label}</span>
                {badge && <span className="nav-pill">{badge}</span>}
                {isActive && <span className="nav-active-pip" />}
              </button>
            );
          })}
        </nav>

        {/* Sidebar Environment & Status Badges */}
        <div className="sidebar-environment-box">
          <div className="env-badge-item">
            <span className="env-dot env-dot-synthetic" />
            <div>
              <strong>SYNTHETIC DEMO</strong>
              <small>Simulated baseline data</small>
            </div>
          </div>
          <div className="env-badge-item">
            <span className={`env-dot ${chainMode === "testnet" ? "env-dot-chain" : "env-dot-mock"}`} />
            <div>
              <strong>{chainMode === "testnet" ? "MST TESTNET" : "MOCK CHAIN"}</strong>
              <small>{chainMode === "testnet" ? "Chain ID 91562037" : "Offline mode"}</small>
            </div>
          </div>
        </div>

        {/* Human Decision Support Guardrail */}
        <div className="sidebar-foot">
          <div className="status-orbit">
            <ShieldAlert size={16} />
          </div>
          <div>
            <strong>Decision Support</strong>
            <span>Human review required</span>
          </div>
        </div>

        <div className="sidebar-version">
          <span>CONSOLE BUILD</span>
          <span className="mono">v0.2-OP</span>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="main-shell">{children}</main>
    </div>
  );
}
