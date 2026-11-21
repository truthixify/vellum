import { ccc } from "@ckb-ccc/core";
import { ExternalLink, RefreshCw } from "lucide-react";
import { vellumSchemaRegistry } from "@vellum/schemas";

import { schemaPresentation } from "@/lib/claim-issuance";
import type { RecentIssuerClaimsResult } from "@/lib/issuer-claims";

type Props = {
  issuerDid?: string;
  result?: RecentIssuerClaimsResult;
  loading: boolean;
  refreshing: boolean;
  error: Error | null;
  onRefresh: () => void;
};

function truncate(value: string, head = 10, tail = 8): string {
  if (value.length <= head + tail + 1) return value;
  return `${value.slice(0, head)}…${value.slice(-tail)}`;
}

function schemaName(hash: string): string {
  const definition = Object.values(vellumSchemaRegistry).find((schema) => schema.hash === hash);
  return definition ? schemaPresentation(definition.id).title : "Custom schema";
}

function formatIssuedAt(value: bigint): string {
  const milliseconds = Number(value) * 1_000;
  if (!Number.isSafeInteger(milliseconds)) return value.toString();
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(milliseconds));
}

export function RecentIssuerClaims({
  issuerDid,
  result,
  loading,
  refreshing,
  error,
  onRefresh,
}: Props) {
  return (
    <section
      className="issuance-recent"
      aria-labelledby="recent-claims-title"
      aria-busy={loading || refreshing}
    >
      <div className="issuance-section-heading">
        <div>
          <span className="mono-caps">ON-CHAIN OUTPUTS</span>
          <h2 id="recent-claims-title">Recent issuer claims</h2>
          <p>Live Claim Cells whose embedded issuer ID matches the active identity.</p>
        </div>
        <button
          className="issuance-icon-button"
          type="button"
          aria-label="Refresh recent claims"
          title="Refresh recent claims"
          disabled={!issuerDid || refreshing}
          aria-busy={refreshing}
          onClick={onRefresh}
        >
          <RefreshCw size={16} aria-hidden="true" />
        </button>
      </div>

      {!issuerDid ? (
        <p className="issuance-recent__state">Select an issuer identity to read its claims.</p>
      ) : loading ? (
        <p className="issuance-recent__state">Reading live Claim Cells…</p>
      ) : error ? (
        <div className="issuance-recent__state issuance-recent__state--error" role="alert">
          <p>Recent claims are unavailable: {error.message}</p>
          <button className="issuance-inline-action" type="button" onClick={onRefresh}>
            Try again
          </button>
        </div>
      ) : result?.claims.length === 0 ? (
        <div className="issuance-recent__state">
          <strong>No claims yet</strong>
          <p>The next committed claim from this issuer will appear here.</p>
        </div>
      ) : (
        <div className="issuance-claim-list">
          {result?.claims.map((claim) => (
            <article
              className="issuance-claim-row"
              key={`${claim.transactionHash}:${claim.outputIndex}`}
            >
              <div>
                <strong>{schemaName(claim.schemaHash)}</strong>
                <span className="mono">{claim.schemaHash}</span>
              </div>
              <div>
                <small>Subject lock</small>
                <span
                  className="mono"
                  aria-label={`Subject lock ${claim.subjectLockHash}`}
                  title={claim.subjectLockHash}
                >
                  {truncate(claim.subjectLockHash)}
                </span>
              </div>
              <div>
                <small>Issued</small>
                <span>{formatIssuedAt(claim.issuedAt)}</span>
              </div>
              <div>
                <small>Capacity</small>
                <span className="mono">{ccc.fixedPointToString(claim.capacity, 8)} CKB</span>
              </div>
              <a
                href={`https://testnet.explorer.nervos.org/transaction/${claim.transactionHash}`}
                target="_blank"
                rel="noreferrer"
                aria-label={`Open transaction ${claim.transactionHash} in the CKB Testnet explorer`}
                title="Open transaction in explorer"
              >
                <ExternalLink size={16} aria-hidden="true" />
              </a>
            </article>
          ))}
        </div>
      )}

      {(result?.invalidCells ?? 0) > 0 && (
        <p className="issuance-recent__note">
          {result?.invalidCells} malformed Claim Cell
          {result?.invalidCells === 1 ? " was" : "s were"} excluded.
        </p>
      )}
      {result?.scanLimitReached && (
        <p className="issuance-recent__note">
          The bounded scan ended before ten claims from this issuer were found.
        </p>
      )}
    </section>
  );
}
