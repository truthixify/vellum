import { ArrowUpRight, Check, ExternalLink } from "lucide-react";
import { StatusMark } from "@vellum/ui";

import {
  BUDGET_ALLOCATIONS,
  GRANT_PROPOSAL_URL,
  GRANT_RECORD_UPDATED_AT,
  GRANT_STAGES,
  GRANT_TOTAL_USD,
  GRANT_VOTE,
  GRANT_VOTE_URL,
  GRANT_VOTE_VERIFICATION_URL,
  PUBLICLY_RECORDED_PAID_USD,
  REMAINING_GRANT_USD,
} from "../data/grant-transparency";

const ROADMAP_URL = "https://github.com/users/truthixify/projects/2";
const ISSUES_URL = "https://github.com/truthixify/vellum/issues";

function formatUsd(amount: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(amount);
}

function ExternalLinkIcon() {
  return <ArrowUpRight size={13} aria-hidden="true" />;
}

export function Transparency() {
  return (
    <div className="transparency-page">
      <section className="transparency-hero site-content">
        <StatusMark tone="warning" icon={false}>
          Grant delivery in progress
        </StatusMark>
        <h1>Grant funding and delivery record</h1>
        <p>
          Vellum's reputation extension is funded by the CKB Community Fund DAO. This page records
          the approved budget, public payment evidence, milestone delivery, and the method used by
          the live reputation service.
        </p>
        <div className="transparency-hero__meta">
          <a href={GRANT_PROPOSAL_URL}>
            Read the approved proposal <ExternalLinkIcon />
          </a>
          <span>
            Updated <time dateTime={GRANT_RECORD_UPDATED_AT}>November 21, 2026</time>
          </span>
        </div>
      </section>

      <section
        className="transparency-section transparency-section--strong"
        id="funding"
        aria-labelledby="funding-title"
      >
        <div className="site-content">
          <div className="transparency-section-heading">
            <div>
              <span className="eyebrow">Funding</span>
              <h2 id="funding-title">Four equal delivery stages</h2>
            </div>
            <p>
              The award is denominated in USD and paid in CKB at the exchange rate used for each
              disbursement.
            </p>
          </div>

          <div className="funding-summary" aria-label="Grant funding summary">
            <div>
              <small>Total award</small>
              <strong>{formatUsd(GRANT_TOTAL_USD)}</strong>
              <span>Approved by CFDAO</span>
            </div>
            <div>
              <small>Publicly recorded as paid</small>
              <strong>{formatUsd(PUBLICLY_RECORDED_PAID_USD)}</strong>
              <span>Initial funding through Milestone 2</span>
            </div>
            <div>
              <small>Remaining grant amount</small>
              <strong>{formatUsd(REMAINING_GRANT_USD)}</strong>
              <span>Milestone 3</span>
            </div>
            <div>
              <small>Payments recorded</small>
              <strong>3 of 4</strong>
              <span>Every transaction linked below</span>
            </div>
          </div>

          <div className="funding-vote">
            <div>
              <small>Community vote</small>
              <strong>Passed with {GRANT_VOTE.approval} approval</strong>
              <span>
                {GRANT_VOTE.totalWeight} total voting weight, confirmed on{" "}
                <time dateTime={GRANT_VOTE.confirmedAt}>September 4, 2026</time>.
              </span>
            </div>
            <div>
              <a href={GRANT_VOTE_URL}>
                Vote record <ExternalLinkIcon />
              </a>
              <a href={GRANT_VOTE_VERIFICATION_URL}>
                Independent verification <ExternalLinkIcon />
              </a>
            </div>
          </div>
        </div>
      </section>

      <section className="transparency-section" id="milestones" aria-labelledby="milestones-title">
        <div className="site-content">
          <div className="transparency-section-heading">
            <div>
              <span className="eyebrow">Delivery</span>
              <h2 id="milestones-title">Milestones and evidence</h2>
            </div>
            <p>
              Status follows the public proposal thread, merged repository evidence, and the GitHub
              milestone record.
            </p>
          </div>

          <ol className="grant-stages">
            {GRANT_STAGES.map((stage, index) => (
              <li id={stage.id} key={stage.id}>
                <span className="grant-stage__number mono">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <div className="grant-stage__body">
                  <div className="grant-stage__topline">
                    <small>{stage.label}</small>
                    <StatusMark tone={stage.tone} icon={stage.status !== "In progress"}>
                      {stage.status}
                    </StatusMark>
                  </div>
                  <h3>{stage.title}</h3>
                  <p>{stage.summary}</p>
                  <div className="grant-stage__terms">
                    <span>{formatUsd(stage.allocationUsd)} allocation</span>
                    <span>{stage.paymentState}</span>
                  </div>
                  <div className="grant-stage__links" aria-label={`${stage.label} evidence`}>
                    {stage.evidence.map((item) => (
                      <a href={item.href} key={item.href}>
                        {item.label} <ExternalLinkIcon />
                      </a>
                    ))}
                  </div>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section
        className="transparency-section transparency-section--strong"
        id="allocation"
        aria-labelledby="allocation-title"
      >
        <div className="site-content">
          <div className="transparency-section-heading">
            <div>
              <span className="eyebrow">Allocation</span>
              <h2 id="allocation-title">Approved use of funds</h2>
            </div>
            <p>
              The proposal uses a high-level allocation rather than reimbursing individual invoices.
            </p>
          </div>

          <div className="budget-table">
            <div className="budget-table__head" aria-hidden="true">
              <span>Category</span>
              <span>Amount</span>
              <span>Share</span>
              <span>Scope</span>
            </div>
            {BUDGET_ALLOCATIONS.map((allocation) => (
              <div key={allocation.category}>
                <strong>{allocation.category}</strong>
                <span className="mono">{formatUsd(allocation.amountUsd)}</span>
                <span className="mono">{allocation.share}</span>
                <span>{allocation.detail}</span>
              </div>
            ))}
          </div>
          <p className="transparency-note">
            These figures reproduce the approved grant allocation. They are not a claim that every
            allocated dollar has already been spent. Payment evidence is linked per stage above.
          </p>
        </div>
      </section>

      <section className="transparency-section" id="method" aria-labelledby="method-title">
        <div className="site-content">
          <div className="transparency-section-heading">
            <div>
              <span className="eyebrow">Published method</span>
              <h2 id="method-title">Reputation policy and service record</h2>
            </div>
            <p>
              Scores remain inspectable and versioned. The service reports unavailable evidence
              instead of guessing a partial result.
            </p>
          </div>

          <div className="method-table">
            <div className="method-table__head">
              <span>Version</span>
              <span>Status</span>
              <span>Current scope</span>
            </div>
            <div>
              <span className="mono">vellum.reputation.v7</span>
              <span>Live on Testnet</span>
              <span>
                Scores accepted work in curated CKB repositories, eligible CKBoost completions,
                verified account age and recency, and recognized community evidence.
              </span>
            </div>
          </div>

          <div className="service-grid">
            <div>
              <small>Issuer state</small>
              <strong>Resolved from CKB</strong>
              <span>
                <Check size={12} aria-hidden="true" /> Trusted issuer and current DID state are
                checked during evaluation.
              </span>
            </div>
            <div>
              <small>Reputation service</small>
              <strong>Public endpoint available</strong>
              <span>
                <Check size={12} aria-hidden="true" /> Returns categories and supporting evidence
                for a did:ckb subject.
              </span>
            </div>
            <div>
              <small>Score range</small>
              <strong>0 to 1000</strong>
              <span>Five fixed categories with published maxima.</span>
            </div>
            <div>
              <small>Failure behavior</small>
              <strong>No guessed scores</strong>
              <span>Unavailable chain or issuer evidence produces an unavailable result.</span>
            </div>
          </div>

          <div className="transparency-columns transparency-columns--method">
            <div>
              <h3>Known limitations</h3>
              <ul>
                <li>The current reputation protocol operates on CKB Testnet.</li>
                <li>GitHub activity counts only in the published CKB repository registry.</li>
                <li>A score does not prove uniqueness, humanity, honesty, or intent.</li>
                <li>Applications decide whether and how a Vellum score affects access.</li>
              </ul>
            </div>
            <div>
              <h3>Method sources</h3>
              <ul className="source-list">
                <li>
                  <a href="https://github.com/truthixify/vellum/tree/main/packages/scoring">
                    Reputation policy implementation <ExternalLink size={13} aria-hidden="true" />
                  </a>
                </li>
                <li>
                  <a href="/docs/integrators">
                    Integration guide <ExternalLink size={13} aria-hidden="true" />
                  </a>
                </li>
                <li>
                  <a href="https://dashboard.usevellum.xyz/reputation">
                    Live reputation explorer <ExternalLink size={13} aria-hidden="true" />
                  </a>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      <section
        className="transparency-section transparency-contact"
        aria-labelledby="contact-title"
      >
        <div className="site-content transparency-contact__inner">
          <div>
            <span className="eyebrow">Corrections and review</span>
            <h2 id="contact-title">Question the record in public</h2>
            <p>
              Use the proposal thread for funding and delivery questions. Use GitHub for technical
              corrections, implementation issues, or integration requests.
            </p>
          </div>
          <div className="transparency-contact__links">
            <a className="v-button v-button--primary" href={GRANT_PROPOSAL_URL}>
              Open proposal thread <ExternalLinkIcon />
            </a>
            <a className="v-button v-button--secondary" href={ISSUES_URL}>
              Open GitHub issues <ExternalLinkIcon />
            </a>
            <a href={ROADMAP_URL}>
              View public roadmap <ExternalLinkIcon />
            </a>
          </div>
        </div>
      </section>
    </div>
  );
}
