import * as Dialog from "@radix-ui/react-dialog";
import { History, X } from "lucide-react";

import { RecentIssuerClaims } from "@/components/issuance/RecentIssuerClaims";
import type { RecentIssuerClaimsResult } from "@/lib/issuer-claims";

type Props = {
  issuerDid?: string;
  result?: RecentIssuerClaimsResult;
  loading: boolean;
  refreshing: boolean;
  error: Error | null;
  onRefresh: () => void;
};

export function RecentClaimsDialog(props: Props) {
  return (
    <Dialog.Root>
      <Dialog.Trigger asChild>
        <button className="issuance-history-trigger" type="button">
          <History size={16} aria-hidden="true" />
          Recent claims
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="issuance-dialog-overlay" />
        <Dialog.Content
          className="issuance-dialog issuance-history-dialog"
          aria-describedby="recent-claims-description"
        >
          <div className="issuance-dialog__header">
            <div>
              <Dialog.Title>Issuer claim history</Dialog.Title>
              <Dialog.Description id="recent-claims-description">
                Live Claim Cells from the active issuer.
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <button
                className="issuance-icon-button"
                type="button"
                aria-label="Close claim history"
                title="Close"
              >
                <X size={17} aria-hidden="true" />
              </button>
            </Dialog.Close>
          </div>
          <RecentIssuerClaims {...props} />
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
