import { Download, Filter } from "lucide-react";
import { createFileRoute } from "@tanstack/react-router";
import { PreviewBadge, StatusMark } from "@vellum/ui";
import { useState } from "react";

import { useDocumentTitle } from "@/hooks/use-document-title";

export const Route = createFileRoute("/activity")({ component: ActivityPage });

const EVENTS = [
  {
    tone: "warning",
    title: "Claim update prepared - protocol contribution",
    state: "Pending",
    time: "4 minutes ago",
    actor: "by CKBoost",
    tx: "0xb4e1...22f9",
    kind: "claims",
  },
  {
    tone: "positive",
    title: "Claim issued - protocol contribution",
    state: "",
    time: "3 months ago",
    actor: "by CKBoost",
    tx: "0x91c4...7ab2",
    kind: "claims",
  },
  {
    tone: "danger",
    title: "Claim deleted - working group membership",
    state: "Revoked",
    time: "4 months ago",
    actor: "by you",
    tx: "0x2c77...8901",
    kind: "claims",
  },
  {
    tone: "neutral",
    title: "Identity edited - display name",
    state: "",
    time: "5 months ago",
    actor: "by you",
    tx: "0x7a20...33bc",
    kind: "identity",
  },
  {
    tone: "neutral",
    title: "Key rotated",
    state: "",
    time: "7 months ago",
    actor: "by you",
    tx: "0x5c11...9ee1",
    kind: "identity",
  },
  {
    tone: "neutral",
    title: "Identity claimed",
    state: "",
    time: "10 months ago",
    actor: "by you",
    tx: "0x1f83...40aa",
    kind: "identity",
  },
] as const;

function ActivityPage() {
  useDocumentTitle("Activity");
  const [filter, setFilter] = useState<"all" | "claims" | "identity">("all");
  const visibleEvents = filter === "all" ? EVENTS : EVENTS.filter((event) => event.kind === filter);

  function cycleFilter() {
    setFilter((current) =>
      current === "all" ? "claims" : current === "claims" ? "identity" : "all",
    );
  }

  function exportEvents() {
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(visibleEvents, null, 2)], { type: "application/json" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = `vellum-${filter}-activity-preview.json`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="preview-page">
      <header className="preview-page__header preview-page__header--bottom">
        <div>
          <h1>Activity</h1>
          <p>Example history for the planned evidence extension.</p>
        </div>
        <div className="preview-header-actions">
          <PreviewBadge />
          <button className="v-button v-button--quiet" onClick={cycleFilter} aria-live="polite">
            <Filter size={13} />
            {filter === "all" ? "Event type" : filter === "claims" ? "Claims" : "Identity"}
          </button>
          <button className="v-button v-button--quiet" onClick={exportEvents}>
            <Download size={13} />
            Export
          </button>
        </div>
      </header>
      <ol className="full-activity-timeline">
        {visibleEvents.map((event) => (
          <li className={`tone-${event.tone}`} key={event.tx}>
            <span className="event-node" />
            <div>
              <strong>{event.title}</strong>
              {event.state && <StatusMark tone={event.tone}>{event.state}</StatusMark>}
              <time className="mono">{event.time}</time>
              <small>{event.actor}</small>
              <span className="mono activity-hash">{event.tx}</span>
            </div>
          </li>
        ))}
      </ol>
      <p className="activity-note">
        Preview fixtures are isolated from live DID operation history. Wallet-backed identity
        history remains available under Identity.
      </p>
    </div>
  );
}
