export type GrantStageStatus = "Paid" | "In progress";

export type GrantStage = {
  id: string;
  label: string;
  title: string;
  status: GrantStageStatus;
  tone: "positive" | "warning";
  allocationUsd: number;
  paymentState: string;
  summary: string;
  evidence: readonly {
    label: string;
    href: string;
  }[];
};

export const GRANT_RECORD_UPDATED_AT = "2026-11-21";
export const GRANT_TOTAL_USD = 7_000;
export const GRANT_TRANCHE_USD = 1_750;

export const GRANT_PROPOSAL_URL =
  "https://talk.nervos.org/t/dis-vellum-reputation-extension-on-did-ckb/10613";
export const GRANT_VOTE_URL =
  "https://dao.ckb.community/thread/vot-vellum-reputation-extension-on-did-ckb-77380";
export const GRANT_VOTE_VERIFICATION_URL =
  "https://github.com/kydchen/ckb-dao-watchdog/tree/main/Verification%20Logs%20-%20Vellum%20V2";

export const GRANT_VOTE = {
  approval: "64.37%",
  totalWeight: "242,742,014 CKB",
  confirmedAt: "2026-09-04",
} as const;

export const GRANT_STAGES: readonly GrantStage[] = [
  {
    id: "initial-funding",
    label: "Initial funding",
    title: "Roadmap and public tracking",
    status: "Paid",
    tone: "positive",
    allocationUsd: GRANT_TRANCHE_USD,
    paymentState: "Payment recorded on September 5, 2026",
    summary:
      "The approved proposal entered delivery with a public roadmap, issue tracker, and milestone board.",
    evidence: [
      { label: "Approval record", href: `${GRANT_PROPOSAL_URL}/4` },
      { label: "Payment record", href: `${GRANT_PROPOSAL_URL}/7` },
      {
        label: "Payment transaction",
        href: "https://explorer.nervos.org/transaction/0x8f954193651b18d9ddeda44494f76a3a8d72aaf699b808a785d6e83da69f66a4",
      },
      { label: "Public roadmap", href: "https://github.com/users/truthixify/projects/2" },
    ],
  },
  {
    id: "claim-cell-sdk-scoring",
    label: "Milestone 1",
    title: "Claim Cell, SDK, verification, and scoring",
    status: "Paid",
    tone: "positive",
    allocationUsd: GRANT_TRANCHE_USD,
    paymentState: "Payment recorded on October 15, 2026",
    summary:
      "Testnet Claim contracts, the Vellum SDK, account verification, published schemas, and the reputation policy shipped and passed review.",
    evidence: [
      { label: "Delivery report", href: `${GRANT_PROPOSAL_URL}/9` },
      { label: "Payment record", href: `${GRANT_PROPOSAL_URL}/14` },
      {
        label: "Implementation record",
        href: "https://github.com/truthixify/vellum/milestone/1?closed=1",
      },
      {
        label: "Testnet deployment",
        href: "https://github.com/truthixify/vellum/blob/main/deployments/testnet.json",
      },
      {
        label: "Payment transaction",
        href: "https://explorer.nervos.org/transaction/0x1d55a5eb7e13e00a37e00d9438a4393e09c4373f475f05c3475188037bc921ee",
      },
    ],
  },
  {
    id: "profiles-ckboost-website",
    label: "Milestone 2",
    title: "Builder profiles, CKBoost, and public website",
    status: "Paid",
    tone: "positive",
    allocationUsd: GRANT_TRANCHE_USD,
    paymentState: "Payment recorded on November 17, 2026",
    summary:
      "Public profiles, exact-schema claim renderers, CKBoost issuance and scoring, and the public product and documentation experience shipped.",
    evidence: [
      { label: "Delivery report", href: `${GRANT_PROPOSAL_URL}/15` },
      { label: "Payment record", href: `${GRANT_PROPOSAL_URL}/21` },
      {
        label: "Implementation record",
        href: "https://github.com/truthixify/vellum/milestone/2?closed=1",
      },
      {
        label: "CKBoost integration",
        href: "https://github.com/Alive24/CKBoost/pull/65",
      },
      {
        label: "Live public profile",
        href: "https://usevellum.xyz/profile/did%3Ackb%3Aomdrzidnxy3lrdrwc6bo4sll6zljhuar",
      },
      {
        label: "Payment transaction",
        href: "https://explorer.nervos.org/transaction/0x9895440207d47230b87fe7861fd747ef017a75adbc26aa098f0e037f87366833",
      },
    ],
  },
  {
    id: "governance-issuance-domain",
    label: "Milestone 3",
    title: "Governance, partner issuance, and production readiness",
    status: "In progress",
    tone: "warning",
    allocationUsd: GRANT_TRANCHE_USD,
    paymentState: "Released after delivery review and approval",
    summary:
      "The governance reference and demo, wallet issuance UI, and production domains are shipped. Final review and production cleanup remain.",
    evidence: [
      {
        label: "Current milestone",
        href: "https://github.com/truthixify/vellum/milestone/3",
      },
      {
        label: "Governance reference",
        href: "https://github.com/truthixify/vellum/pull/71",
      },
      {
        label: "Gated poll implementation",
        href: "https://github.com/truthixify/vellum/pull/73",
      },
      {
        label: "Issuance implementation",
        href: "https://github.com/truthixify/vellum/pull/75",
      },
      {
        label: "Live gated poll",
        href: "https://dashboard.usevellum.xyz/demo/governance",
      },
      {
        label: "Live issuance UI",
        href: "https://dashboard.usevellum.xyz/issue",
      },
    ],
  },
];

export const BUDGET_ALLOCATIONS = [
  {
    category: "Development",
    amountUsd: 6_000,
    share: "85.7%",
    detail:
      "Claim contracts, SDK, verification, scoring, profiles, integrations, governance, and issuance UI.",
  },
  {
    category: "Infrastructure and hosting",
    amountUsd: 500,
    share: "7.1%",
    detail: "Domain, public applications, verification endpoints, and standard hosting costs.",
  },
  {
    category: "Documentation and community",
    amountUsd: 500,
    share: "7.1%",
    detail:
      "Schema specifications, integration guides, delivery reports, and public review support.",
  },
] as const;

export const PUBLICLY_RECORDED_PAID_USD = GRANT_STAGES.filter(
  (stage) => stage.status === "Paid",
).reduce((total, stage) => total + stage.allocationUsd, 0);

export const REMAINING_GRANT_USD = GRANT_TOTAL_USD - PUBLICLY_RECORDED_PAID_USD;
