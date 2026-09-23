import { GITHUB_CLAIM_SCHEMA_ID, GITHUB_CONTRIBUTION_CLAIM_SCHEMA_ID } from "@vellum/schemas";

import type { GithubSubmission } from "@/lib/github-verification";

export type GithubSubmissionReference = {
  kind: "identity" | "contribution";
  label: string;
  schemaId: typeof GITHUB_CLAIM_SCHEMA_ID | typeof GITHUB_CONTRIBUTION_CLAIM_SCHEMA_ID;
  claimId: string;
  outputIndex: number;
};

export function githubSubmissionReferences(
  submission: GithubSubmission,
): GithubSubmissionReference[] {
  return [
    {
      kind: "identity",
      label: "Account identity",
      schemaId: GITHUB_CLAIM_SCHEMA_ID,
      claimId: submission.claimId,
      outputIndex: submission.outputIndex,
    },
    ...(submission.contribution
      ? [
          {
            kind: "contribution" as const,
            label: "CKB contributions",
            schemaId: GITHUB_CONTRIBUTION_CLAIM_SCHEMA_ID,
            claimId: submission.contribution.claimId,
            outputIndex: submission.contribution.outputIndex,
          },
        ]
      : []),
  ];
}

function shorten(value: string, start = 16, end = 8): string {
  return value.length > start + end + 3 ? `${value.slice(0, start)}...${value.slice(-end)}` : value;
}

export function GithubIssuedClaims({ submission }: { submission: GithubSubmission }) {
  const references = githubSubmissionReferences(submission);
  return (
    <section className="account-verification-issued" aria-labelledby="github-issued-title">
      <div className="account-verification-issued__heading">
        <h3 id="github-issued-title">Claim outputs</h3>
        <span>
          {references.length} Claim Cell{references.length === 1 ? "" : "s"}
        </span>
      </div>
      <div className="account-verification-issued__list">
        {references.map((reference) => (
          <article key={reference.kind}>
            <div>
              <strong>{reference.label}</strong>
              <small>
                {reference.kind === "identity"
                  ? "Issued for every verification"
                  : "Issued when qualifying public activity is found"}
              </small>
            </div>
            <dl>
              <div>
                <dt>Schema</dt>
                <dd className="mono">{reference.schemaId}</dd>
              </div>
              <div>
                <dt>Output</dt>
                <dd className="mono">{reference.outputIndex}</dd>
              </div>
              <div>
                <dt>Claim ID</dt>
                <dd className="mono" title={reference.claimId}>
                  {shorten(reference.claimId)}
                </dd>
              </div>
            </dl>
          </article>
        ))}
      </div>
    </section>
  );
}
