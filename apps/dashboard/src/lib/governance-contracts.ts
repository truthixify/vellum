export const GOVERNANCE_API_VERSION = "1" as const;
export const GOVERNANCE_NETWORK = "ckb_testnet" as const;
export const GOVERNANCE_CHOICES = ["yes", "no"] as const;

export type GovernanceChoice = (typeof GOVERNANCE_CHOICES)[number];
export type GovernanceProposalStatus = "upcoming" | "open" | "closed";

export const GOVERNANCE_PROPOSAL = {
  id: "public-governance-participation.v1",
  title: "Public governance participation",
  question: "Should Vellum add opt-in governance participation records to public profiles?",
  summary:
    "This signalling vote tests portable eligibility, reputation-derived voting weight, and DID-controller authorization without executing an on-chain decision.",
  opensAt: 1_794_960_000,
  closesAt: 1_801_440_000,
  network: GOVERNANCE_NETWORK,
  execution: "signalling-only",
  choices: [
    { id: "yes", label: "Yes", description: "Add opt-in participation records." },
    { id: "no", label: "No", description: "Keep governance participation separate." },
  ],
  eligibilityPolicy: {
    version: "vellum.governance.github-gate.v1",
    label: "Active Vellum GitHub verification",
    issuerDid: "did:ckb:hlvxrdt3e7iwvuxdmbvejp6hc4yoo3no",
    schemaId: "vellum.social.github.v1",
    schemaHash: "0x25980dec7f198c7b228a621c61b911b8a20c55b340f398e495c4be65aa399f3c",
  },
  weightingPolicy: {
    version: "vellum.governance.reputation-bands.v1",
    reputationPolicyVersion: "vellum.reputation.v7",
    label: "Bounded reputation weight",
    bands: [
      { minimumScore: 0, maximumScore: 249, weight: 1 },
      { minimumScore: 250, maximumScore: 499, weight: 2 },
      { minimumScore: 500, maximumScore: 749, weight: 3 },
      { minimumScore: 750, maximumScore: 999, weight: 4 },
      { minimumScore: 1_000, maximumScore: 1_000, weight: 5 },
    ],
  },
} as const;

export type GovernanceEvidenceReference = {
  claimId: string;
  transactionHash: string;
  outputIndex: number;
  issuerDid: string;
  schemaHash: string;
  issuedAt: number;
};

export type GovernanceEvaluation = {
  status: "eligible" | "ineligible";
  network: typeof GOVERNANCE_NETWORK;
  subjectDid: string;
  evaluatedAt: number;
  eligibilityPolicyVersion: string;
  reputation: {
    policyVersion: string;
    score: number;
    maximum: number;
  };
  participationWeight: number | null;
  evidence: readonly GovernanceEvidenceReference[];
};

export type GovernanceTally = {
  choice: GovernanceChoice;
  voterCount: number;
  weight: number;
};

export type GovernanceResults = {
  voterCount: number;
  totalWeight: number;
  tallies: readonly GovernanceTally[];
};

export type GovernanceResultsState =
  | { status: "available"; results: GovernanceResults }
  | { status: "unavailable"; message: string };

export type GovernanceProposalSnapshot = {
  version: typeof GOVERNANCE_API_VERSION;
  network: typeof GOVERNANCE_NETWORK;
  proposal: typeof GOVERNANCE_PROPOSAL;
  proposalStatus: GovernanceProposalStatus;
  serverTime: number;
  results: GovernanceResultsState;
};

export type GovernanceVoteReceipt = {
  version: typeof GOVERNANCE_API_VERSION;
  receiptId: string;
  network: typeof GOVERNANCE_NETWORK;
  proposalId: string;
  subjectDid: string;
  choice: GovernanceChoice;
  participationWeight: number;
  eligibilityPolicyVersion: string;
  reputation: {
    policyVersion: string;
    score: number;
    maximum: number;
  };
  evaluatedAt: number;
  recordedAt: number;
  controllerLockHash: string;
  evidence: readonly GovernanceEvidenceReference[];
};

export type GovernanceChallenge = {
  challenge: string;
  message: string;
  expiresAt: number;
};

export type GovernanceVoteResult = {
  receipt: GovernanceVoteReceipt;
  recordStatus: "recorded" | "duplicate";
  results: GovernanceResultsState;
};

export type GovernanceErrorCode =
  | "invalid_request"
  | "method_not_allowed"
  | "proposal_not_open"
  | "subject_not_found"
  | "subject_control_invalid"
  | "challenge_invalid"
  | "ineligible"
  | "already_voted"
  | "receipt_not_found"
  | "service_unavailable";

export type GovernanceErrorResponse = {
  ok: false;
  version: typeof GOVERNANCE_API_VERSION;
  error: { code: GovernanceErrorCode; message: string };
};

export function isGovernanceChoice(value: string): value is GovernanceChoice {
  return GOVERNANCE_CHOICES.some((choice) => choice === value);
}

export function governanceProposalStatus(now: number): GovernanceProposalStatus {
  if (!Number.isSafeInteger(now) || now < 0) throw new TypeError("Invalid proposal timestamp");
  if (now < GOVERNANCE_PROPOSAL.opensAt) return "upcoming";
  if (now >= GOVERNANCE_PROPOSAL.closesAt) return "closed";
  return "open";
}

export function governanceParticipationWeight(score: number): number {
  if (!Number.isSafeInteger(score) || score < 0 || score > 1_000) {
    throw new TypeError("Reputation score must be an integer from 0 to 1000");
  }
  const band = GOVERNANCE_PROPOSAL.weightingPolicy.bands.find(
    ({ minimumScore, maximumScore }) => score >= minimumScore && score <= maximumScore,
  );
  if (!band) throw new TypeError("Reputation score is outside the weighting policy");
  return band.weight;
}
