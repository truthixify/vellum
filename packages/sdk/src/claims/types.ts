import type { ccc } from "@ckb-ccc/core";

export type ClaimScriptConfigLike = {
  claimType: ccc.ScriptInfoLike;
  didLock?: ccc.ScriptInfoLike;
  /** Defaults to the client's KnownScript.DidCkb entry. */
  didCkb?: ccc.ScriptInfoLike;
};

export type ClaimSubjectLike =
  | {
      lock: ccc.ScriptLike;
      did?: never;
    }
  | {
      did: string;
      lock?: never;
    };

export type ClaimDataV1Like<TPayload = unknown> = {
  issuerId: ccc.HexLike;
  nonce: ccc.HexLike;
  /** Issuer-asserted Unix timestamp in seconds. */
  issuedAt: ccc.NumLike;
  /** Optional expiry as a Unix timestamp in seconds. */
  expiresAt?: ccc.NumLike | null;
  payload: TPayload;
};

export type ClaimDataLike<TPayload = unknown> =
  | {
      type?: "v1" | null;
      value: ClaimDataV1Like<TPayload>;
    }
  | {
      inner: {
        type?: "v1" | null;
        value: ClaimDataV1Like<TPayload>;
      };
    };

export type ClaimTimeEvaluation =
  | {
      status: "not-evaluated";
    }
  | {
      status: "not-yet-active" | "active" | "expired";
      /** Application-selected Unix timestamp in seconds. */
      evaluatedAt: ccc.Num;
    };

export type ClaimIssuerState =
  | {
      status: "active";
      cell: ccc.Cell;
      controller: ccc.Script;
    }
  | {
      status: "deactivated" | "missing";
    }
  | {
      status: "ambiguous";
      cells: readonly ccc.Cell[];
    }
  | {
      status: "unavailable";
      reason: string;
    };

export type Claim<TPayload = unknown> = {
  version: "v1";
  claimId: ccc.Hex;
  issuerDid: string;
  issuerId: ccc.Hex;
  issuerType: ccc.Script;
  issuerState: ClaimIssuerState;
  subjectLock: ccc.Script;
  subjectLockHash: ccc.Hex;
  schemaHash: ccc.Hex;
  nonce: ccc.Hex;
  /** Issuer-asserted Unix timestamp in seconds. */
  issuedAt: ccc.Num;
  /** Optional expiry as a Unix timestamp in seconds. */
  expiresAt?: ccc.Num;
  payload: TPayload;
  payloadBytes: ccc.Hex;
  cell: ccc.Cell;
  duplicateCells: readonly ccc.Cell[];
  verification: {
    inclusion: "live";
    issuerAuthorization: "accepted-by-configured-claim-type";
    time: ClaimTimeEvaluation;
  };
};

export type ClaimFilter = {
  subject: ClaimSubjectLike;
  issuerDid?: string;
  schemaHash?: ccc.HexLike;
  /** Unix timestamp in seconds. No current-clock default is applied when omitted. */
  evaluationTime?: ccc.NumLike;
  /** CKB indexer chain order; defaults to "asc". */
  order?: "asc" | "desc";
  /** Indexer page size, not a cap on the complete result. */
  pageSize?: number;
};

export type ClaimReadFailureCode =
  | "unsupported-issuer-deployment"
  | "invalid-type-args"
  | "unsupported-data-version"
  | "invalid-claim-data"
  | "invalid-dag-cbor"
  | "non-canonical-dag-cbor";

export type ClaimReadFailure = {
  cell: ccc.Cell;
  code: ClaimReadFailureCode;
  message: string;
};

export type ReadClaimsResult = {
  claims: Claim[];
  invalid: ClaimReadFailure[];
};

export type ReadClaimsProps = {
  client: ccc.Client;
  scripts: ClaimScriptConfigLike;
  filter: ClaimFilter;
};

export type ClaimSchema<TPayload> = {
  id: string;
  hash: ccc.HexLike;
  parse: (payload: unknown) => TPayload;
};
