import { Check, ExternalLink } from "lucide-react";
import { StatusMark } from "@vellum/ui";

export function Transparency() {
  return (
    <div className="transparency-page">
      <section className="transparency-hero site-content">
        <StatusMark tone="positive">Live on CKB Testnet</StatusMark>
        <h1>Method and service record</h1>
        <p>
          What Vellum measures, which evidence contributes, and what the score does not claim. Every
          response names the policy version and evaluation time used for that result.
        </p>
      </section>
      <section className="transparency-section transparency-section--strong">
        <div className="site-content">
          <h2>Published method</h2>
          <div className="method-table">
            <div className="method-table__head">
              <span>Version</span>
              <span>Status</span>
              <span>Change</span>
            </div>
            <div>
              <span className="mono">vellum.reputation.v1</span>
              <span>Live on Testnet</span>
              <span>
                Scores active GitHub account claims by account tenure and verification recency.
              </span>
            </div>
          </div>
        </div>
      </section>
      <section className="transparency-section">
        <div className="site-content service-grid">
          <div>
            <small>Issuer state</small>
            <strong>Resolved on CKB Testnet</strong>
            <span>
              <Check size={12} />
              Trusted issuer and current DID state are checked during evaluation
            </span>
          </div>
          <div>
            <small>Reputation service</small>
            <strong>Public endpoint available</strong>
            <span>
              <Check size={12} />
              Returns the aggregate, categories, and evidence for a did:ckb subject
            </span>
          </div>
          <div>
            <small>Score range</small>
            <strong>0 to 1000</strong>
            <span>Five fixed categories with published maxima; v1 currently scores two.</span>
          </div>
          <div>
            <small>Failure behavior</small>
            <strong>No guessed scores</strong>
            <span>
              Unavailable chain or issuer evidence produces an unavailable result, not zero.
            </span>
          </div>
        </div>
      </section>
      <section className="transparency-section">
        <div className="site-content transparency-columns">
          <div>
            <h2>Known limitations</h2>
            <ul>
              <li>The current policy and service operate on CKB Testnet.</li>
              <li>Version 1 recognizes the published GitHub schema and trusted issuer.</li>
              <li>A score does not prove uniqueness, humanity, honesty, or intent.</li>
              <li>Applications decide whether and how a Vellum score affects access.</li>
            </ul>
          </div>
          <div>
            <h2>Current sources</h2>
            <ul className="source-list">
              <li>
                <a href="https://github.com/truthixify/vellum/tree/main/packages/scoring">
                  Reputation policy implementation <ExternalLink size={13} />
                </a>
              </li>
              <li>
                <a href="/docs">
                  Vellum integration guide <ExternalLink size={13} />
                </a>
              </li>
              <li>
                <a href="https://dashboard.usevellum.xyz/reputation">
                  Live reputation explorer <ExternalLink size={13} />
                </a>
              </li>
            </ul>
          </div>
        </div>
      </section>
    </div>
  );
}
