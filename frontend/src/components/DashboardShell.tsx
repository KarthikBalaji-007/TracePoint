import { Activity, BellRing, Crosshair, Radar, ShieldAlert } from "lucide-react";
import type { PropsWithChildren } from "react";

const navigation = [
  { href: "#overview", label: "Overview", Icon: Radar },
  { href: "#risk-map", label: "Risk map", Icon: Crosshair },
  { href: "#alert-workflow", label: "Alert workflow", Icon: BellRing },
  { href: "#activity-log", label: "Activity log", Icon: Activity },
];

export function DashboardShell({ children }: PropsWithChildren) {
  return <div className="app-shell">
    <aside className="sidebar">
      <a className="brand" href="#overview" aria-label="TracePoint home"><span className="brand-mark"><Crosshair size={20} /></span><span><strong>TracePoint</strong><small>INTELLIGENCE DESK</small></span></a>
      <div className="sidebar-section-label">WORKSPACE</div>
      <nav className="side-nav" aria-label="Workspace navigation">{navigation.map(({ href, label, Icon }, index) => <a className={index === 0 ? "nav-active" : ""} href={href} key={href}><Icon size={17} /><span>{label}</span>{index === 1 && <span className="nav-live-dot" />}</a>)}</nav>
      <div className="sidebar-foot"><div className="status-orbit"><ShieldAlert size={16} /></div><div><strong>Decision support</strong><span>Human review required</span></div></div>
      <div className="sidebar-version">LOCAL HACKATHON BUILD <span>v0.1</span></div>
    </aside>
    <main className="main-shell">{children}</main>
  </div>;
}
