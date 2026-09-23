import { createFileRoute, Link } from "@tanstack/react-router";
import { StatusMark } from "@vellum/ui";
import { ArrowRight, BadgeCheck, CircleDollarSign, KeyRound, Landmark, Send } from "lucide-react";

import { ProviderMark } from "@/components/verification/ProviderMark";
import { useDocumentTitle } from "@/hooks/use-document-title";

export const Route = createFileRoute("/verify/")({
  component: VerificationPage,
});

const CLAIM_FACTS = [
  { label: "Claim issuer", value: "Vellum", icon: Landmark },
  { label: "Issuance", value: "Automatic", icon: Send },
  { label: "Network cost", value: "Paid by Vellum", icon: CircleDollarSign },
  { label: "Account access", value: "Not retained", icon: KeyRound },
] as const;

function VerificationPage() {
  useDocumentTitle("Verification");

  return (
    <div className="verification-page">
      <header className="verification-page__header">
        <div>
          <span className="verification-page__kicker">
            <BadgeCheck size={15} aria-hidden="true" /> Account evidence
          </span>
          <h1>Verification</h1>
          <p>Verify an external account and add public evidence to your did:ckb identity.</p>
        </div>
        <StatusMark tone="info" icon={false}>
          CKB Testnet
        </StatusMark>
      </header>

      <section className="verification-sources" aria-labelledby="verification-sources-title">
        <div className="verification-section-heading">
          <div>
            <span>Available sources</span>
            <h2 id="verification-sources-title">Choose a provider</h2>
          </div>
          <p>Temporary account access is used only for verification and is never recorded.</p>
        </div>

        <div className="verification-source-list">
          <Link className="verification-source" to="/verify/github">
            <span className="verification-source__icon" aria-hidden="true">
              <ProviderMark provider="github" size={22} />
            </span>
            <span className="verification-source__body">
              <span className="verification-source__title">
                <strong>GitHub</strong>
                <StatusMark tone="positive">Available</StatusMark>
              </span>
              <span className="verification-source__description">
                Verify account control and eligible public contributions to approved CKB
                repositories.
              </span>
              <span className="verification-source__meta">
                <span>
                  <small>Evidence</small>
                  Identity, age, and CKB contributions
                </span>
                <span>
                  <small>Schemas</small>
                  <code>social + contribution</code>
                </span>
                <span>
                  <small>Record</small>1 or 2 Claim Cells
                </span>
              </span>
            </span>
            <span className="verification-source__action">
              Open GitHub verification <ArrowRight size={15} aria-hidden="true" />
            </span>
          </Link>

          <Link className="verification-source" to="/verify/discord">
            <span className="verification-source__icon" aria-hidden="true">
              <ProviderMark provider="discord" size={22} />
            </span>
            <span className="verification-source__body">
              <span className="verification-source__title">
                <strong>Discord</strong>
                <StatusMark tone="positive">Available</StatusMark>
              </span>
              <span className="verification-source__description">
                Verify account control, CKB community membership, join dates, and recognized roles.
              </span>
              <span className="verification-source__meta">
                <span>
                  <small>Evidence</small>
                  CKB community history
                </span>
                <span>
                  <small>Schemas</small>
                  <code>social + community</code>
                </span>
                <span>
                  <small>Record</small>
                  Claim Cells
                </span>
              </span>
            </span>
            <span className="verification-source__action">
              Open Discord verification <ArrowRight size={15} aria-hidden="true" />
            </span>
          </Link>

          <Link className="verification-source" to="/verify/telegram">
            <span className="verification-source__icon" aria-hidden="true">
              <ProviderMark provider="telegram" size={22} />
            </span>
            <span className="verification-source__body">
              <span className="verification-source__title">
                <strong>Telegram</strong>
                <StatusMark tone="positive">Available</StatusMark>
              </span>
              <span className="verification-source__description">
                Verify account control and current membership in recognized CKB communities.
              </span>
              <span className="verification-source__meta">
                <span>
                  <small>Evidence</small>
                  Current CKB membership
                </span>
                <span>
                  <small>Schemas</small>
                  <code>social + community</code>
                </span>
                <span>
                  <small>Record</small>
                  Claim Cells
                </span>
              </span>
            </span>
            <span className="verification-source__action">
              Open Telegram verification <ArrowRight size={15} aria-hidden="true" />
            </span>
          </Link>

          <Link className="verification-source" to="/verify/bluesky" search={{}}>
            <span className="verification-source__icon" aria-hidden="true">
              <ProviderMark provider="bluesky" size={22} />
            </span>
            <span className="verification-source__body">
              <span className="verification-source__title">
                <strong>Bluesky</strong>
                <StatusMark tone="positive">Available</StatusMark>
              </span>
              <span className="verification-source__description">
                Link a current Bluesky handle and its stable AT Protocol identity.
              </span>
              <span className="verification-source__meta">
                <span>
                  <small>Evidence</small>
                  Stable account identity
                </span>
                <span>
                  <small>Schema</small>
                  <code>vellum.social.bluesky.v1</code>
                </span>
                <span>
                  <small>Record</small>
                  Claim Cell
                </span>
              </span>
            </span>
            <span className="verification-source__action">
              Open Bluesky verification <ArrowRight size={15} aria-hidden="true" />
            </span>
          </Link>
        </div>
      </section>

      <section className="verification-policy" aria-labelledby="verification-policy-title">
        <div className="verification-section-heading">
          <div>
            <span>Claim policy</span>
            <h2 id="verification-policy-title">Handled by Vellum</h2>
          </div>
          <p>No issuer key or CKB payment is requested from the account holder.</p>
        </div>
        <dl className="verification-policy__facts">
          {CLAIM_FACTS.map((fact) => {
            const Icon = fact.icon;
            return (
              <div key={fact.label}>
                <Icon size={16} strokeWidth={1.7} aria-hidden="true" />
                <dt>{fact.label}</dt>
                <dd>{fact.value}</dd>
              </div>
            );
          })}
        </dl>
        <p className="verification-policy__note">
          Verified claims are public on CKB Testnet. They contain public evidence, never the
          credential used to verify it.
        </p>
      </section>
    </div>
  );
}
