import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { AlertCircle, ArrowLeft, RefreshCw } from "lucide-react";

import { VoteReceipt } from "@/components/governance/VoteReceipt";
import { useDocumentTitle } from "@/hooks/use-document-title";
import { fetchGovernanceReceipt, GovernanceRequestError } from "@/lib/governance";

export const Route = createFileRoute("/demo/governance/receipt/$receiptId")({
  component: GovernanceReceiptPage,
});

function GovernanceReceiptPage() {
  useDocumentTitle("Governance vote receipt");
  const { receiptId } = Route.useParams();
  const receipt = useQuery({
    queryKey: ["governance-receipt", receiptId],
    queryFn: () => fetchGovernanceReceipt(receiptId),
    retry: false,
  });

  return (
    <div className="governance-receipt-page">
      <Link className="governance-receipt-page__back" to="/demo/governance">
        <ArrowLeft size={14} aria-hidden="true" /> Governance demo
      </Link>
      <header>
        <span>Public vote record</span>
        <h1>Governance receipt</h1>
        <p>A durable off-chain record of the signed Testnet governance decision.</p>
      </header>
      {receipt.isLoading ? (
        <div className="governance-evaluation-state" role="status">
          <span className="pulse-dot" aria-hidden="true" /> Loading vote receipt
        </div>
      ) : receipt.error ? (
        <div className="governance-inline-alert" role="alert">
          <AlertCircle size={17} aria-hidden="true" />
          <div>
            <strong>Receipt unavailable</strong>
            <p>
              {receipt.error instanceof GovernanceRequestError
                ? receipt.error.message
                : "The governance receipt could not be loaded."}
            </p>
          </div>
          <button
            className="v-button v-button--quiet"
            type="button"
            onClick={() => void receipt.refetch()}
          >
            <RefreshCw size={14} aria-hidden="true" /> Retry
          </button>
        </div>
      ) : receipt.data ? (
        <VoteReceipt receipt={receipt.data} />
      ) : null}
      <p className="governance-receipt-page__boundary">
        This receipt records an unaudited, off-chain Testnet demonstration. It does not prove one
        person per DID or execute a governance decision.
      </p>
    </div>
  );
}
