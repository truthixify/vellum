import { createFileRoute, Link } from "@tanstack/react-router";
import { StatusMark } from "@vellum/ui";
import {
  ArrowRight,
  BadgeCheck,
  CircleDollarSign,
  Github,
  KeyRound,
  Landmark,
  Send,
} from "lucide-react";

import { useDocumentTitle } from "@/hooks/use-document-title";

export const Route = createFileRoute("/verify/")({
  component: VerificationPage,
});

const CLAIM_FACTS = [
  { label: "Claim issuer", value: "Vellum", icon: Landmark },
  { label: "Submission", value: "Automatic", icon: Send },
  { label: "Testnet cost", value: "Paid by Vellum", icon: CircleDollarSign },
  { label: "OAuth access", value: "Released before issuance", icon: KeyRound },
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
          <p>Connect an external account and receive a public claim for your did:ckb identity.</p>
        </div>
        <StatusMark tone="info" icon={false}>
          CKB Testnet
        </StatusMark>
      </header>

      <section className="verification-sources" aria-labelledby="verification-sources-title">
        <div className="verification-section-heading">
          <div>
            <span>Available source</span>
            <h2 id="verification-sources-title">Choose an account</h2>
          </div>
          <p>Account access is used for verification only and is not written to the claim.</p>
        </div>

        <Link className="verification-source" to="/verify/github">
          <span className="verification-source__icon" aria-hidden="true">
            <Github size={22} strokeWidth={1.7} />
          </span>
          <span className="verification-source__body">
            <span className="verification-source__title">
              <strong>GitHub</strong>
              <StatusMark tone="positive">Available</StatusMark>
            </span>
            <span className="verification-source__description">
              Prove control of a public GitHub account and bind it to an identity you control.
            </span>
            <span className="verification-source__meta">
              <span>
                <small>Evidence</small>
                Public account ownership
              </span>
              <span>
                <small>Schema</small>
                <code>vellum.social.github.v1</code>
              </span>
              <span>
                <small>Record</small>
                Claim Cell
              </span>
            </span>
          </span>
          <span className="verification-source__action">
            View GitHub status <ArrowRight size={15} aria-hidden="true" />
          </span>
        </Link>
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
          Verified account claims are public on CKB Testnet. They contain public account data, not
          the OAuth credential used to check it.
        </p>
      </section>
    </div>
  );
}
