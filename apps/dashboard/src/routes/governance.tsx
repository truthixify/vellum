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
          <span className="mono governance-id">
            policy:example-community/v1 - reads vellum.reputation.v5
          </span>
          <dl className="governance-rules">
            <div>
              <dt>Minimum score</dt>
              <dd className="mono">150 of 1000</dd>
            </div>
            <div>
              <dt>Required categories</dt>
              <dd className="mono">tenure, recency</dd>
            </div>
            <div>
              <dt>Accepted issuer states</dt>
              <dd className="mono">trusted evidence issuer</dd>
            </div>
            <div>
              <dt>Maximum data age</dt>
              <dd className="mono">evaluated on request</dd>
            </div>
            <div>
              <dt>Evaluated</dt>
              <dd className="mono">example only</dd>
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
          Reputation could not be calculated for this identity, so the minimum-score rule cannot be
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
          <span>The example consumer has not refreshed its source evidence.</span>
        </div>
        <StatusMark icon={false}>Previous result withheld until refresh</StatusMark>
        <button className="v-button v-button--secondary" onClick={onRecalculate}>
          Recalculate
        </button>
      </div>
    );
  const eligible = result === "eligible";
  const rows = eligible
    ? [
        ["Score 200 >= 150", "Pass"],
        ["Tenure and recency contribute", "Pass - 100 each"],
        ["Trusted GitHub issuer", "Pass"],
        ["Evidence evaluated on request", "Pass"],
      ]
    : [
        ["Score 100 >= 150", "Fail"],
        ["Tenure contributes", "Pass - 100"],
        ["Recency contributes", "Fail - 0"],
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
