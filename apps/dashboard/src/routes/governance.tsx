import { AlertCircle, Check, Clock3, MinusCircle } from "lucide-react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { PreviewBadge, StatusMark } from "@vellum/ui";
import { useState } from "react";

import { useDocumentTitle } from "@/hooks/use-document-title";

export const Route = createFileRoute("/governance")({ component: GovernancePage });

type Result = "eligible" | "not-eligible" | "unable" | "stale";

function GovernancePage() {
  useDocumentTitle("Governance policy");
  const [result, setResult] = useState<Result>("eligible");
  return (
    <div className="preview-page">
      <header className="preview-page__header">
        <div>
          <h1>Governance policy</h1>
          <p>
            Evaluate an identity against a published policy. This demonstrates policy reading; it is
            not production governance.
          </p>
        </div>
        <PreviewBadge />
      </header>
      <div className="result-switcher">
        <span>Result state</span>
        {(["eligible", "not-eligible", "unable", "stale"] as Result[]).map((value) => (
          <button
            className={result === value ? "active" : ""}
            onClick={() => setResult(value)}
            key={value}
          >
            {value.replace("-", " ")}
          </button>
        ))}
      </div>
      <div className="governance-layout">
        <section>
          <h2>Policy</h2>
          <span className="mono governance-id">policy:grants-council/v3 - method v0.4.1</span>
          <dl className="governance-rules">
            <div>
              <dt>Minimum index</dt>
              <dd className="mono">40</dd>
            </div>
            <div>
              <dt>Required categories</dt>
              <dd className="mono">contribution</dd>
            </div>
            <div>
              <dt>Accepted issuer states</dt>
              <dd className="mono">listed</dd>
            </div>
            <div>
              <dt>Maximum data age</dt>
              <dd className="mono">24 hours</dd>
            </div>
            <div>
              <dt>Evaluated</dt>
              <dd className="mono">2026-09-07 09:41 UTC</dd>
            </div>
          </dl>
          <label className="governance-input">
            Identity to evaluate
            <span>
              <input defaultValue="did:ckb:0x8f2a...c41d" />
              <button className="v-button v-button--primary" onClick={() => setResult("eligible")}>
                Evaluate
              </button>
            </span>
          </label>
        </section>
        <section>
          <h2>Result</h2>
          <GovernanceResult result={result} onRecalculate={() => setResult("eligible")} />
        </section>
      </div>
    </div>
  );
}

function GovernanceResult({
  result,
  onRecalculate,
}: {
  result: Result;
  onRecalculate: () => void;
}) {
  if (result === "unable")
    return (
      <div className="governance-notice">
        <strong>
          <AlertCircle size={14} />
          Unable to evaluate
        </strong>
        <p>
          Reputation has not been calculated for this identity, so the minimum-index rule cannot be
          applied. The identity itself can still resolve normally.
        </p>
        <Link className="v-button v-button--secondary" to="/resolve">
          Open the record
        </Link>
      </div>
    );
  if (result === "stale")
    return (
      <div className="governance-result">
        <div className="notice-line">
          <Clock3 size={14} />
          <span>Data stale. The example calculation is 31 hours old and the policy allows 24.</span>
        </div>
        <StatusMark icon={false}>Eligible - as of 2026-09-06 02:12 UTC</StatusMark>
        <button className="v-button v-button--secondary" onClick={onRecalculate}>
          Recalculate
        </button>
      </div>
    );
  const eligible = result === "eligible";
  const rows = eligible
    ? [
        ["Index 68 >= 40", "Pass"],
        ["Contribution claims present", "Pass - 2"],
        ["At least one listed issuer", "Pass - CKBoost"],
        ["Data age 18 minutes <= 24 hours", "Pass"],
      ]
    : [
        ["Index 31 >= 40", "Fail"],
        ["Contribution claims present", "Pass - 1"],
        ["At least one listed issuer", "Fail - issuer not in registry"],
      ];
  return (
    <div className="governance-result">
      <StatusMark tone={eligible ? "positive" : "neutral"} icon={false}>
        {eligible ? (
          <>
            <Check size={12} />
            Eligible
          </>
        ) : (
          <>
            <MinusCircle size={12} />
            Not eligible
          </>
        )}
      </StatusMark>
      <dl>
        {rows.map(([rule, state]) => (
          <div key={rule}>
            <dt>{rule}</dt>
            <dd className={state.startsWith("Pass") ? "positive" : "danger"}>{state}</dd>
          </div>
        ))}
      </dl>
      <Link className="v-button v-button--secondary" to="/">
        Inspect contributing evidence
      </Link>
      <p>Voting is not connected in this preview.</p>
    </div>
  );
}
