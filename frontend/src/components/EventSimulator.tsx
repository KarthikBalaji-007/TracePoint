import { LoaderCircle, RadioTower, Send } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import type { EventType, Zone } from "../types";

const amounts = ["BAND_1", "BAND_2", "BAND_3", "BAND_4"];
const channels = ["UPI", "AEPS", "CARD", "NET_BANKING"];
const categories = ["PHISHING", "QR_FRAUD", "IMPERSONATION", "INVESTMENT_SCAM"];

export function EventSimulator({ zones, busy, result, onSubmit }: {
  zones: Zone[];
  busy: boolean;
  result: string | null;
  onSubmit: (event: { zone: Zone; eventType: EventType; amountBand: string; channel: string; category: string }) => Promise<void>;
}) {
  const [zoneId, setZoneId] = useState(zones[0]?.zone_id ?? "");
  const [eventType, setEventType] = useState<EventType>("TRANSACTION_SIGNAL");
  const [amountBand, setAmountBand] = useState("BAND_4");
  const [channel, setChannel] = useState("UPI");
  const [category, setCategory] = useState("QR_FRAUD");
  const zone = zones.find((candidate) => candidate.zone_id === zoneId) ?? zones[0];

  useEffect(() => {
    if (!zones.some((item) => item.zone_id === zoneId) && zones[0]) setZoneId(zones[0].zone_id);
  }, [zoneId, zones]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (zone) await onSubmit({ zone, eventType, amountBand, channel, category });
  }

  return (
    <section className="simulator-section" id="event-simulator" aria-labelledby="simulator-title">
      <div className="section-heading">
        <div><span className="eyebrow eyebrow-alert">DEMO CONTROL</span><h2 id="simulator-title">SIMULATE SYNTHETIC EVENT</h2></div>
        <RadioTower size={18} className="simulator-icon" />
      </div>
      <p className="simulator-description">Creates a labeled synthetic signal, runs the local event worker, then refreshes live and fused rankings.</p>
      <form className="simulator-form" onSubmit={submit}>
        <label>Zone<select value={zoneId} onChange={(event) => setZoneId(event.target.value)} required>{zones.map((item) => <option key={item.zone_id} value={item.zone_id}>{item.label} · {item.zone_id}</option>)}</select></label>
        <label>Signal type<select value={eventType} onChange={(event) => setEventType(event.target.value as EventType)}><option value="TRANSACTION_SIGNAL">Transaction signal</option><option value="COMPLAINT">Complaint</option></select></label>
        <label>Amount band<select value={amountBand} onChange={(event) => setAmountBand(event.target.value)}>{amounts.map((item) => <option key={item}>{item}</option>)}</select></label>
        <label>Channel<select value={channel} onChange={(event) => setChannel(event.target.value)}>{channels.map((item) => <option key={item}>{item}</option>)}</select></label>
        <label>Category<select value={category} onChange={(event) => setCategory(event.target.value)}>{categories.map((item) => <option key={item}>{item}</option>)}</select></label>
        <button className="button button-dark simulator-submit" type="submit" disabled={busy || !zone}>{busy ? <LoaderCircle size={16} className="spin" /> : <Send size={16} />}{busy ? "Processing event" : "Ingest and refresh"}</button>
      </form>
      <div className="simulator-result" aria-live="polite">{result ?? "Synthetic provenance is attached to every simulated event."}</div>
    </section>
  );
}
