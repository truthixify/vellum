import { AlertCircle, Clock, ExternalLink } from "lucide-react";
import { PreviewBadge } from "@vellum/ui";

export function Transparency() {
  return (
    <div className="transparency-page">
      <section className="transparency-hero site-content">
        <PreviewBadge label="Planned reputation method" />
        <h1>Method and service record</h1>
        <p>
          What Vellum intends to measure, from which sources, and what it will not claim. The
          reputation extension is not deployed; the records below document the proposed, reviewable
          methodology.
        </p>
      </section>
      <section className="transparency-section transparency-section--strong">
        <div className="site-content">
          <h2>Proposed method versions</h2>
          <div className="method-table">
            <div className="method-table__head">
              <span>Version</span>
              <span>Status</span>
              <span>Change</span>
            </div>
            <div>
              <span className="mono">v0.4.1</span>
              <span>Design candidate</span>
              <span>Self-declared account links do not contribute to account coverage.</span>
            </div>
            <div>
              <span className="mono">v0.4.0</span>
              <span>Research iteration</span>
              <span>Category maxima defined; expired claims decay instead of disappearing.</span>
            </div>
            <div>
              <span className="mono">v0.3.2</span>
              <span>Research iteration</span>
              <span>Contribution and credential categories introduced.</span>
            </div>
          </div>
        </div>
      </section>
      <section className="transparency-section">
        <div className="site-content service-grid">
          <div>
            <small>Issuer registry source</small>
            <strong>Not deployed</strong>
            <span>
              <Clock size={12} />
              Planned as a published allowlist
            </span>
          </div>
          <div>
            <small>Reputation indexer status</small>
            <strong>Not deployed</strong>
            <span>
              <AlertCircle size={12} />
              No score is calculated from live data
            </span>
          </div>
          <div>
            <small>Coverage statistics</small>
            <strong>Not available</strong>
            <span>No aggregate reporting endpoint exists. This page does not estimate one.</span>
          </div>
          <div>
            <small>Uptime history</small>
            <strong>Not available</strong>
            <span>Monitoring will be published when the service exists.</span>
          </div>
        </div>
      </section>
      <section className="transparency-section">
        <div className="site-content transparency-columns">
          <div>
            <h2>Known limitations</h2>
            <ul>
              <li>An index cannot prove uniqueness, humanity, honesty, or intent.</li>
              <li>
                Issuer listing only describes a registry decision; it does not make a claim true.
              </li>
              <li>Claims may be revoked after a cached calculation.</li>
              <li>Any initial reputation work is testnet-only and must remain reproducible.</li>
            </ul>
          </div>
          <div>
            <h2>Current sources</h2>
            <ul className="source-list">
              <li>
                <a href="https://github.com/ckb-devrel/ccc/tree/master/packages/did-ckb">
                  did:ckb implementation <ExternalLink size={13} />
                </a>
              </li>
              <li>
                <a href="/docs">
                  Vellum integration guide <ExternalLink size={13} />
                </a>
              </li>
              <li>
                <a href="/resolve">
                  Live identity resolver <ExternalLink size={13} />
                </a>
              </li>
            </ul>
          </div>
        </div>
      </section>
    </div>
  );
}
