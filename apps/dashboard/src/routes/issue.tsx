import { ccc, useCcc, useSigner } from "@ckb-ccc/connector-react";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ExternalLink,
  FileJson,
  ShieldCheck,
  WalletCards,
} from "lucide-react";
import {
  vellumSchemaRegistry,
  type VellumSchemaDefinition,
  type VellumSchemaId,
} from "@vellum/schemas";
import { writeClaim, type WriteClaimResult } from "@usevellum/sdk";
import { useEffect, useMemo, useState, type FormEvent } from "react";

import { ClaimPayloadFields } from "@/components/issuance/ClaimPayloadFields";
import { RecentClaimsDialog } from "@/components/issuance/RecentClaimsDialog";
import { SubjectQrScanner } from "@/components/issuance/SubjectQrScanner";
import { Brackets, FieldRow, IdTab, Manifest } from "@/components/vellum/Manifest";
import { VButton } from "@/components/vellum/VButton";
import { useDocumentTitle } from "@/hooks/use-document-title";
import { useActiveIdentity } from "@/lib/active-identity-context";
import {
  canIssueRegisteredSchema,
  createEmptyClaimDraft,
  createExampleClaimDraft,
  formatCanonicalPayload,
  parseCustomClaimPayload,
  parseExpiry,
  parseRegisteredClaimDraft,
  parseSubjectDid,
  registeredSchemaIdsForIssuer,
  schemaPayloadDefinition,
  schemaPresentation,
  signAndBroadcastPreparedClaim,
  type ClaimFormDraft,
} from "@/lib/claim-issuance";
import { dashboardClaimScripts } from "@/lib/claim-scripts";
import { readRecentIssuerClaims } from "@/lib/issuer-claims";

export const Route = createFileRoute("/issue")({ component: IssueClaim });

const DEFAULT_SCHEMA = vellumSchemaRegistry["vellum.social.github.v1"];

type IssuanceMode = "registered" | "custom";
type IssuanceStage = 0 | 1 | 2;

const ISSUANCE_STEPS = ["Subject", "Evidence", "Terms", "Review"] as const;
const SCHEMA_GROUPS = ["Partner", "Social", "Community", "Contribution"] as const;

type PreparedIssuance = {
  result: WriteClaimResult;
  schemaTitle: string;
  schemaId?: string;
  schemaHash: ccc.Hex;
  payload: unknown;
  subjectDid: string;
  issuerDid: string;
  issuedAt: number;
  expiresAt?: number;
  fee: bigint;
  capacity: bigint;
};

type Confirmation =
  | { status: "pending" }
  | { status: "committed"; blockNumber?: bigint }
  | { status: "rejected"; reason?: string };

function messageFrom(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function truncate(value: string, head = 12, tail = 10): string {
  if (value.length <= head + tail + 1) return value;
  return `${value.slice(0, head)}…${value.slice(-tail)}`;
}

function displayName(definition: VellumSchemaDefinition): string {
  return schemaPresentation(definition.id).title;
}

function formatTimestamp(value: number): string {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "long",
  }).format(new Date(value * 1_000));
}

function IssuanceSteps({ activeStep }: { activeStep: number }) {
  return (
    <ol className="issuance-steps" aria-label="Claim issuance progress">
      {ISSUANCE_STEPS.map((label, index) => (
        <li
          key={label}
          className={
            index === activeStep
              ? "issuance-step issuance-step--active"
              : index < activeStep
                ? "issuance-step issuance-step--complete"
                : "issuance-step"
          }
          aria-current={index === activeStep ? "step" : undefined}
        >
          <span>{index < activeStep ? <Check size={13} aria-hidden="true" /> : index + 1}</span>
          <strong>{label}</strong>
        </li>
      ))}
    </ol>
  );
}

function IssuanceAccessState({
  kind,
  onConnect,
}: {
  kind: "disconnected" | "loading" | "mainnet" | "missing-did" | "identity-error";
  onConnect: () => void;
}) {
  const content = {
    disconnected: {
      title: "Connect the issuer wallet",
      body: "The connected wallet must control the did:ckb identity that signs and funds this Claim Cell.",
    },
    loading: {
      title: "Reading issuer identities",
      body: "Vellum is checking which did:ckb identities the connected wallet controls.",
    },
    mainnet: {
      title: "Switch to CKB Testnet",
      body: "Wallet issuance is limited to the deployed Testnet Claim Type and DID Lock contracts.",
    },
    "missing-did": {
      title: "Claim an issuer identity",
      body: "This wallet does not control a did:ckb identity on Testnet yet.",
    },
    "identity-error": {
      title: "Issuer identities are unavailable",
      body: "Vellum could not read the did:ckb identities controlled by this wallet.",
    },
  }[kind];

  return (
    <section className="issuance-access-state">
      <span className="mono-caps">ISSUER ACCESS</span>
      <h2>{content.title}</h2>
      <p>{content.body}</p>
      {kind === "disconnected" && (
        <VButton variant="verdant" onClick={onConnect}>
          <WalletCards size={16} aria-hidden="true" /> Connect wallet
        </VButton>
      )}
      {kind === "missing-did" && (
        <Link className="v-button v-button--primary" to="/claim">
          Claim a DID
        </Link>
      )}
    </section>
  );
}

function TransactionReview({
  prepared,
  busy,
  error,
  onBack,
  onSign,
}: {
  prepared: PreparedIssuance;
  busy: boolean;
  error: string | null;
  onBack: () => void;
  onSign: () => void;
}) {
  return (
    <Manifest
      idTab={<IdTab color="verdant">CLAIM CELL</IdTab>}
      state="PENDING"
      stateLabel="READY TO SIGN"
      offset
      footerLeft="VELLUM · ISSUANCE TRANSACTION"
      className="issuance-transaction"
    >
      <div className="issuance-transaction__intro">
        <span className="mono-caps">CLAIM IDENTIFIER</span>
        <Brackets className="block">
          <div className="issuance-claim-id">{prepared.result.claimId}</div>
        </Brackets>
      </div>
      <div>
        <FieldRow label="Schema" value={prepared.schemaTitle} />
        {prepared.schemaId && <FieldRow label="Schema ID" value={prepared.schemaId} mono />}
        <FieldRow label="Schema hash" value={prepared.schemaHash} mono />
        <FieldRow label="Subject DID" value={prepared.subjectDid} mono />
        <FieldRow label="Issuer DID" value={prepared.issuerDid} mono />
        <FieldRow label="Payer" value="Connected issuer wallet" />
        <FieldRow label="Issued at" value={formatTimestamp(prepared.issuedAt)} />
        <FieldRow
          label="Expires"
          value={prepared.expiresAt ? formatTimestamp(prepared.expiresAt) : "No expiry"}
        />
        <FieldRow
          label="Claim capacity"
          value={`${ccc.fixedPointToString(prepared.capacity, 8)} CKB`}
          mono
        />
        <FieldRow
          label="Network fee"
          value={`${ccc.fixedPointToString(prepared.fee, 8)} CKB`}
          mono
        />
        <FieldRow
          label="Inputs / outputs"
          value={`${prepared.result.tx.inputs.length} / ${prepared.result.tx.outputs.length}`}
          mono
        />
      </div>
      <div className="issuance-transaction__payload">
        <span className="mono-caps">NORMALIZED PAYLOAD</span>
        <pre>{formatCanonicalPayload(prepared.payload)}</pre>
        <p>This value is encoded as canonical DAG-CBOR in the Claim Cell.</p>
      </div>
      {error && (
        <p className="issuance-form-error" role="alert">
          {error}
        </p>
      )}
      <div className="issuance-transaction__actions">
        <VButton variant="ghost" onClick={onBack} disabled={busy}>
          <ArrowLeft size={15} aria-hidden="true" /> Back to compose
        </VButton>
        <VButton variant="verdant" onClick={onSign} disabled={busy}>
          {busy ? "Waiting for wallet…" : "Sign and issue claim"}
        </VButton>
      </div>
    </Manifest>
  );
}

function IssuanceConfirmation({
  prepared,
  transactionHash,
  confirmation,
  error,
  onNewClaim,
}: {
  prepared: PreparedIssuance;
  transactionHash: ccc.Hex;
  confirmation: Confirmation;
  error: string | null;
  onNewClaim: () => void;
}) {
  const committed = confirmation.status === "committed";
  const rejected = confirmation.status === "rejected";
  return (
    <Manifest
      idTab={<IdTab color={committed ? "verdant" : "cobalt"}>CLAIM CELL</IdTab>}
      state={committed ? "ACTIVE" : rejected ? "CONTESTED" : "PENDING"}
      stateLabel={committed ? "COMMITTED" : rejected ? "REJECTED" : "SUBMITTED"}
      offset
      footerLeft="VELLUM · ISSUANCE RECEIPT"
      className="issuance-transaction"
    >
      <div className="issuance-confirmation__hero">
        {committed ? (
          <Check size={28} aria-hidden="true" />
        ) : (
          <FileJson size={28} aria-hidden="true" />
        )}
        <div>
          <span className="mono-caps">{committed ? "CLAIM IS LIVE" : "TRANSACTION STATUS"}</span>
          <h2>
            {committed
              ? "Claim issued"
              : rejected
                ? "Transaction rejected"
                : "Waiting for confirmation"}
          </h2>
          <p>
            {committed
              ? "The Claim Cell is now readable from the subject's public evidence record."
              : rejected
                ? (confirmation.reason ?? "The CKB node rejected this transaction.")
                : "The signed transaction has been submitted."}
          </p>
        </div>
      </div>
      <div>
        <FieldRow label="Claim ID" value={prepared.result.claimId} mono />
        <FieldRow label="Transaction" value={transactionHash} mono />
        <FieldRow label="Output" value={String(prepared.result.outputIndex)} mono />
        <FieldRow label="Subject DID" value={prepared.subjectDid} mono />
        {confirmation.status === "committed" && confirmation.blockNumber !== undefined && (
          <FieldRow label="Block" value={confirmation.blockNumber.toString()} mono />
        )}
      </div>
      {error && (
        <p className="issuance-form-error" role="alert">
          {error}
        </p>
      )}
      <div className="issuance-transaction__actions">
        <VButton variant="secondary" onClick={onNewClaim}>
          Issue another claim
        </VButton>
        <a
          className="v-button v-button--primary"
          href={`https://testnet.explorer.nervos.org/transaction/${transactionHash}`}
          target="_blank"
          rel="noreferrer"
        >
          View transaction <ExternalLink size={15} aria-hidden="true" />
        </a>
        {committed && (
          <a
            className="v-button v-button--quiet"
            href={`https://usevellum.xyz/profile/${encodeURIComponent(prepared.subjectDid)}`}
            target="_blank"
            rel="noreferrer"
          >
            Open subject profile
          </a>
        )}
      </div>
    </Manifest>
  );
}

function IssueClaim() {
  useDocumentTitle("Issue a claim");
  const signer = useSigner();
  const { client, open } = useCcc();
  const {
    records,
    activeDid,
    setActiveDid,
    address,
    network,
    isConnected,
    isLoading,
    error: identityError,
  } = useActiveIdentity();

  const [stage, setStage] = useState<IssuanceStage>(0);
  const [mode, setMode] = useState<IssuanceMode>("registered");
  const [schemaId, setSchemaId] = useState<VellumSchemaId>(DEFAULT_SCHEMA.id);
  const [draft, setDraft] = useState<ClaimFormDraft>(() =>
    createEmptyClaimDraft(schemaPayloadDefinition(DEFAULT_SCHEMA)),
  );
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [subjectDid, setSubjectDid] = useState("");
  const [subjectError, setSubjectError] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState("");
  const [customSchemaHash, setCustomSchemaHash] = useState("");
  const [customPayload, setCustomPayload] = useState('{\n  "evidence": ""\n}');
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [prepared, setPrepared] = useState<PreparedIssuance | null>(null);
  const [transactionHash, setTransactionHash] = useState<ccc.Hex | null>(null);
  const [confirmation, setConfirmation] = useState<Confirmation>({ status: "pending" });

  const authorizedDefinitions = useMemo(
    () => registeredSchemaIdsForIssuer(activeDid).map((id) => vellumSchemaRegistry[id]),
    [activeDid],
  );
  const hasRegisteredSchemas = authorizedDefinitions.length > 0;
  const selectedDefinition = vellumSchemaRegistry[schemaId];
  const selectedSchema = schemaPayloadDefinition(selectedDefinition);
  const registeredResult = useMemo(
    () => parseRegisteredClaimDraft(selectedDefinition, draft),
    [selectedDefinition, draft],
  );
  const customResult = useMemo(
    () => parseCustomClaimPayload(customSchemaHash, customPayload),
    [customPayload, customSchemaHash],
  );

  const recentClaims = useQuery({
    queryKey: ["recent-issuer-claims", activeDid, network],
    queryFn: () => readRecentIssuerClaims(client, dashboardClaimScripts, activeDid!),
    enabled: !!activeDid && network === "testnet",
    staleTime: 30_000,
  });
  const refetchRecentClaims = recentClaims.refetch;

  useEffect(() => {
    setPrepared(null);
    setTransactionHash(null);
    setConfirmation({ status: "pending" });
    setFormError(null);
    setSubjectError(null);
    setStage(0);
  }, [activeDid, address, network]);

  useEffect(() => {
    if (!transactionHash || confirmation.status !== "pending") return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const poll = async () => {
      try {
        const response = await client.getTransaction(transactionHash);
        if (cancelled) return;
        if (response?.status === "committed") {
          setConfirmation({ status: "committed", blockNumber: response.blockNumber });
          void refetchRecentClaims();
          return;
        }
        if (response?.status === "rejected") {
          setConfirmation({ status: "rejected", reason: response.reason });
          return;
        }
      } catch (error) {
        if (!cancelled) console.warn("Claim transaction polling failed", error);
      }
      if (!cancelled) timer = setTimeout(() => void poll(), 3_000);
    };

    void poll();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [client, confirmation.status, refetchRecentClaims, transactionHash]);

  function selectSchema(definition: VellumSchemaDefinition) {
    setSchemaId(definition.id);
    setDraft(createEmptyClaimDraft(schemaPayloadDefinition(definition)));
    setFieldErrors({});
    setFormError(null);
  }

  function resetIssuance() {
    setPrepared(null);
    setTransactionHash(null);
    setConfirmation({ status: "pending" });
    setFormError(null);
    setFieldErrors({});
    setStage(0);
  }

  function advanceFromSubject() {
    try {
      parseSubjectDid(subjectDid);
      if (mode === "registered") {
        const authorizedDefinition = canIssueRegisteredSchema(activeDid, schemaId)
          ? selectedDefinition
          : authorizedDefinitions[0];
        if (authorizedDefinition) {
          if (authorizedDefinition.id !== schemaId) selectSchema(authorizedDefinition);
        } else {
          setMode("custom");
        }
      }
      setSubjectError(null);
      setFormError(null);
      setStage(1);
    } catch (error) {
      const message = messageFrom(error);
      setSubjectError(message);
      setFormError(message);
    }
  }

  function advanceFromEvidence() {
    if (mode === "registered" && !canIssueRegisteredSchema(activeDid, schemaId)) {
      setFormError("The active issuer DID is not authorized for this registered schema.");
      return;
    }
    if (mode === "registered" && !registeredResult.ok) {
      setFieldErrors(registeredResult.errors);
      setFormError(registeredResult.errors.$form ?? "Complete the required schema fields.");
      return;
    }
    if (mode === "custom" && !customResult.ok) {
      setFormError(customResult.error);
      return;
    }
    setFieldErrors({});
    setFormError(null);
    setStage(2);
  }

  function handleStageSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (stage === 0) {
      advanceFromSubject();
      return;
    }
    if (stage === 1) {
      advanceFromEvidence();
      return;
    }
    void prepareTransaction();
  }

  async function prepareTransaction() {
    if (!signer || !activeDid || network !== "testnet") {
      setFormError("Connect a Testnet wallet that controls the issuer DID.");
      return;
    }

    let normalizedSubject: string;
    try {
      normalizedSubject = parseSubjectDid(subjectDid);
      setSubjectError(null);
    } catch (error) {
      const message = messageFrom(error);
      setSubjectError(message);
      setFormError(message);
      setStage(0);
      return;
    }

    let payload: unknown;
    let claimSchemaHash: ccc.Hex;
    let claimSchemaId: string | undefined;
    let claimSchemaTitle: string;
    if (mode === "registered") {
      if (!canIssueRegisteredSchema(activeDid, schemaId)) {
        setFormError("The active issuer DID is not authorized for this registered schema.");
        setStage(1);
        return;
      }
      if (!registeredResult.ok) {
        setFieldErrors(registeredResult.errors);
        setFormError(registeredResult.errors.$form ?? "Complete the required schema fields.");
        setStage(1);
        return;
      }
      payload = registeredResult.payload;
      claimSchemaHash = ccc.hexFrom(selectedDefinition.hash);
      claimSchemaId = selectedDefinition.id;
      claimSchemaTitle = displayName(selectedDefinition);
      setFieldErrors({});
    } else {
      if (!customResult.ok) {
        setFormError(customResult.error);
        setStage(1);
        return;
      }
      payload = customResult.payload;
      claimSchemaHash = customResult.schemaHash;
      claimSchemaTitle = "Custom schema";
    }

    const issuedAt = Math.floor(Date.now() / 1_000);
    let normalizedExpiry: number | undefined;
    try {
      normalizedExpiry = parseExpiry(expiresAt, issuedAt);
    } catch (error) {
      setFormError(messageFrom(error));
      setStage(2);
      return;
    }

    setBusy(true);
    setFormError(null);
    try {
      const result = await writeClaim({
        issuerSigner: signer,
        scripts: dashboardClaimScripts,
        input: {
          subject: { did: normalizedSubject },
          issuerDid: activeDid,
          schemaHash: claimSchemaHash,
          payload,
          issuedAt,
          expiresAt: normalizedExpiry,
        },
      });
      const output = result.tx.outputs[result.outputIndex];
      if (!output) throw new Error("Prepared transaction is missing its Claim Cell output.");
      const fee = await result.tx.getFee(client);
      setPrepared({
        result,
        schemaTitle: claimSchemaTitle,
        schemaId: claimSchemaId,
        schemaHash: claimSchemaHash,
        payload,
        subjectDid: normalizedSubject,
        issuerDid: activeDid,
        issuedAt,
        expiresAt: normalizedExpiry,
        fee,
        capacity: output.capacity,
      });
    } catch (error) {
      console.error(error);
      setFormError(messageFrom(error));
    } finally {
      setBusy(false);
    }
  }

  async function signAndSubmit() {
    if (!signer || !prepared) return;
    setBusy(true);
    setFormError(null);
    try {
      const hash = await signAndBroadcastPreparedClaim(signer, prepared.result.tx);
      setTransactionHash(hash);
      setConfirmation({ status: "pending" });
    } catch (error) {
      console.error(error);
      setFormError(messageFrom(error));
    } finally {
      setBusy(false);
    }
  }

  let accessState: Parameters<typeof IssuanceAccessState>[0]["kind"] | null = null;
  if (!isConnected) accessState = "disconnected";
  else if (network === "mainnet") accessState = "mainnet";
  else if (isLoading) accessState = "loading";
  else if (identityError) accessState = "identity-error";
  else if (records.length === 0 || !activeDid) accessState = "missing-did";

  const previewPayload =
    mode === "registered"
      ? registeredResult.ok
        ? registeredResult.payload
        : undefined
      : customResult.ok
        ? customResult.payload
        : undefined;

  return (
    <div className="preview-page preview-page--wide issuance-page">
      <header className="preview-page__header issuance-page__header">
        <div>
          <span className="mono-caps">CLAIM ISSUANCE</span>
          <h1>Issue a claim</h1>
        </div>
        <div className="issuance-header-actions">
          {!accessState && (
            <RecentClaimsDialog
              issuerDid={activeDid}
              result={recentClaims.data}
              loading={recentClaims.isLoading}
              refreshing={recentClaims.isFetching}
              error={recentClaims.error instanceof Error ? recentClaims.error : null}
              onRefresh={() => void recentClaims.refetch()}
            />
          )}
        </div>
      </header>

      {accessState ? (
        <IssuanceAccessState kind={accessState} onConnect={() => open()} />
      ) : (
        <section className="issuance-workspace" aria-label="Claim issuance">
          <IssuanceSteps activeStep={transactionHash ? 4 : prepared ? 3 : stage} />

          {transactionHash && prepared ? (
            <div className="issuance-workspace__result">
              <IssuanceConfirmation
                prepared={prepared}
                transactionHash={transactionHash}
                confirmation={confirmation}
                error={formError}
                onNewClaim={resetIssuance}
              />
            </div>
          ) : prepared ? (
            <div className="issuance-workspace__result">
              <TransactionReview
                prepared={prepared}
                busy={busy}
                error={formError}
                onBack={() => {
                  setPrepared(null);
                  setStage(2);
                }}
                onSign={() => void signAndSubmit()}
              />
            </div>
          ) : (
            <form className="claim-form issuance-stage-form" onSubmit={handleStageSubmit}>
              <div className="issuance-stage-scroll">
                <div className="issuance-stage-inner">
                  {stage === 0 && (
                    <section aria-labelledby="issuer-section-title">
                      <div className="issuance-stage-heading">
                        <span className="mono-caps">STEP 1 OF 4</span>
                        <h2 id="issuer-section-title">Choose the claim subject</h2>
                        <p>The active identity signs and funds the Claim Cell.</p>
                      </div>
                      <div className="issuance-field-grid issuance-subject-fields">
                        <div className="issuance-field">
                          <label htmlFor="issuer-did">Issuer identity</label>
                          <select
                            id="issuer-did"
                            value={activeDid}
                            onChange={(event) => setActiveDid(event.target.value)}
                          >
                            {records.map((record) => (
                              <option key={record.did} value={record.did}>
                                {record.profile.displayName
                                  ? `${record.profile.displayName} · ${record.did}`
                                  : record.did}
                              </option>
                            ))}
                          </select>
                          <small>
                            Controller wallet {address ? truncate(address) : "connected"}
                          </small>
                        </div>
                        <div className="issuance-field">
                          <label htmlFor="subject-did">Subject identity</label>
                          <div className="issuance-subject-input">
                            <input
                              id="subject-did"
                              value={subjectDid}
                              placeholder="did:ckb:…"
                              aria-invalid={!!subjectError}
                              aria-describedby={
                                subjectError ? "subject-did-error" : "subject-did-hint"
                              }
                              onChange={(event) => {
                                setSubjectDid(event.target.value);
                                setSubjectError(null);
                                setFormError(null);
                              }}
                            />
                            <SubjectQrScanner
                              onDid={(did) => {
                                setSubjectDid(did);
                                setSubjectError(null);
                                setFormError(null);
                              }}
                            />
                          </div>
                          <small id="subject-did-hint">Claim output owner</small>
                          {subjectError && (
                            <small
                              className="issuance-field__error"
                              id="subject-did-error"
                              role="alert"
                            >
                              {subjectError}
                            </small>
                          )}
                          {activeDid && subjectDid !== activeDid && (
                            <button
                              className="issuance-inline-action"
                              type="button"
                              onClick={() => {
                                setSubjectDid(activeDid);
                                setSubjectError(null);
                                setFormError(null);
                              }}
                            >
                              Use issuer DID as subject
                            </button>
                          )}
                        </div>
                      </div>
                    </section>
                  )}

                  {stage === 1 && (
                    <section aria-labelledby="payload-section-title">
                      <div className="issuance-stage-heading">
                        <span className="mono-caps">STEP 2 OF 4</span>
                        <h2 id="payload-section-title">Describe the evidence</h2>
                        <p>Registered schemas use the same validation as Vellum consumers.</p>
                      </div>
                      <div className="issuance-evidence-toolbar">
                        <div className="issuance-mode" role="group" aria-label="Schema source">
                          <button
                            type="button"
                            className={mode === "registered" ? "active" : ""}
                            aria-pressed={mode === "registered"}
                            aria-describedby={
                              hasRegisteredSchemas ? undefined : "registered-schema-access"
                            }
                            disabled={!hasRegisteredSchemas}
                            title={
                              hasRegisteredSchemas
                                ? undefined
                                : "No registered schemas are assigned to this issuer DID"
                            }
                            onClick={() => {
                              const authorizedDefinition = canIssueRegisteredSchema(
                                activeDid,
                                schemaId,
                              )
                                ? selectedDefinition
                                : authorizedDefinitions[0];
                              if (!authorizedDefinition) return;
                              if (authorizedDefinition.id !== schemaId) {
                                selectSchema(authorizedDefinition);
                              }
                              setMode("registered");
                              setFieldErrors({});
                              setFormError(null);
                            }}
                          >
                            Registered
                          </button>
                          <button
                            type="button"
                            className={mode === "custom" ? "active" : ""}
                            aria-pressed={mode === "custom"}
                            onClick={() => {
                              setMode("custom");
                              setFieldErrors({});
                              setFormError(null);
                            }}
                          >
                            Custom
                          </button>
                        </div>
                        {mode === "registered" && (
                          <div className="issuance-field issuance-schema-select">
                            <label htmlFor="claim-schema">Claim schema</label>
                            <select
                              id="claim-schema"
                              value={schemaId}
                              onChange={(event) =>
                                selectSchema(
                                  vellumSchemaRegistry[event.target.value as VellumSchemaId],
                                )
                              }
                            >
                              {SCHEMA_GROUPS.map((group) => {
                                const definitions = authorizedDefinitions.filter(
                                  (definition) => schemaPresentation(definition.id).group === group,
                                );
                                return definitions.length > 0 ? (
                                  <optgroup key={group} label={group}>
                                    {definitions.map((definition) => (
                                      <option key={definition.id} value={definition.id}>
                                        {displayName(definition)} · {definition.id}
                                      </option>
                                    ))}
                                  </optgroup>
                                ) : null;
                              })}
                            </select>
                          </div>
                        )}
                        {mode === "registered" && (
                          <button
                            className="issuance-example-button"
                            type="button"
                            onClick={() => {
                              setDraft(
                                createExampleClaimDraft(selectedSchema, selectedDefinition.example),
                              );
                              setFieldErrors({});
                              setFormError(null);
                            }}
                          >
                            Load example
                          </button>
                        )}
                      </div>

                      {!hasRegisteredSchemas && (
                        <div className="issuance-schema-access-note" id="registered-schema-access">
                          <ShieldCheck size={17} aria-hidden="true" />
                          <p>
                            No registered schemas are assigned to this issuer DID. Use Custom for
                            other evidence.
                          </p>
                        </div>
                      )}

                      {mode === "registered" ? (
                        <>
                          <div className="issuance-schema-summary">
                            <strong>{displayName(selectedDefinition)}</strong>
                            <span>{schemaPresentation(selectedDefinition.id).summary}</span>
                          </div>
                          <ClaimPayloadFields
                            schema={selectedSchema}
                            value={draft}
                            errors={fieldErrors}
                            onChange={(next) => {
                              setDraft(next);
                              setFieldErrors({});
                              setFormError(null);
                            }}
                          />
                        </>
                      ) : (
                        <div className="issuance-custom-fields">
                          <div className="issuance-custom-intro">
                            <FileJson size={20} aria-hidden="true" />
                            <strong>Advanced path</strong>
                            <p>
                              Supply an immutable schema hash and JSON payload understood by the
                              receiving application.
                            </p>
                          </div>
                          <div className="issuance-field">
                            <label htmlFor="custom-schema-hash">Schema hash</label>
                            <input
                              id="custom-schema-hash"
                              className="mono"
                              value={customSchemaHash}
                              placeholder="0x…"
                              onChange={(event) => {
                                setCustomSchemaHash(event.target.value);
                                setFormError(null);
                              }}
                            />
                            <small>CKB_HASH of the canonical schema manifest</small>
                          </div>
                          <div className="issuance-field">
                            <label htmlFor="custom-payload">JSON payload</label>
                            <textarea
                              id="custom-payload"
                              className="mono"
                              rows={10}
                              value={customPayload}
                              onChange={(event) => {
                                setCustomPayload(event.target.value);
                                setFormError(null);
                              }}
                            />
                          </div>
                        </div>
                      )}
                      {fieldErrors.$form && (
                        <p className="issuance-form-error" role="alert">
                          {fieldErrors.$form}
                        </p>
                      )}
                    </section>
                  )}

                  {stage === 2 && (
                    <section aria-labelledby="terms-section-title">
                      <div className="issuance-stage-heading">
                        <span className="mono-caps">STEP 3 OF 4</span>
                        <h2 id="terms-section-title">Set terms and verify</h2>
                        <p>Check the subject, schema, and normalized payload before preparation.</p>
                      </div>
                      <div className="issuance-terms-grid">
                        <div>
                          <div className="issuance-field issuance-expiry-field">
                            <label htmlFor="claim-expiry">Expiry</label>
                            <input
                              id="claim-expiry"
                              type="datetime-local"
                              value={expiresAt}
                              onChange={(event) => {
                                setExpiresAt(event.target.value);
                                setFormError(null);
                              }}
                            />
                            <small>Optional · leave blank for no expiry</small>
                          </div>
                          <div className="issuance-trust-boundary">
                            <ShieldCheck size={17} aria-hidden="true" />
                            <p>
                              Valid shape does not prove truth. Consumers choose which issuer DIDs
                              they trust for each schema.
                            </p>
                          </div>
                        </div>
                        <div className="issuance-review-summary">
                          <dl>
                            <div>
                              <dt>Issuer</dt>
                              <dd className="mono">{activeDid}</dd>
                            </div>
                            <div>
                              <dt>Subject</dt>
                              <dd className="mono">{subjectDid}</dd>
                            </div>
                            <div>
                              <dt>Schema</dt>
                              <dd>
                                {mode === "registered"
                                  ? selectedDefinition.id
                                  : customSchemaHash || "Custom schema"}
                              </dd>
                            </div>
                          </dl>
                          <span className="mono-caps">NORMALIZED PAYLOAD</span>
                          {previewPayload === undefined ? (
                            <p className="issuance-preview__empty">Payload validation failed.</p>
                          ) : (
                            <pre>{formatCanonicalPayload(previewPayload)}</pre>
                          )}
                        </div>
                      </div>
                    </section>
                  )}
                </div>
              </div>

              <footer className="issuance-stage-footer">
                <div
                  className={`issuance-stage-footer__message${formError ? " issuance-stage-footer__message--error" : ""}`}
                  aria-live="polite"
                >
                  {formError ? (
                    <p className="issuance-form-error" role="alert">
                      {formError}
                    </p>
                  ) : (
                    <span>
                      {stage === 2
                        ? "The wallet signs only after transaction review."
                        : `Step ${stage + 1} of 4`}
                    </span>
                  )}
                </div>
                <div className="issuance-stage-footer__actions">
                  {stage > 0 && (
                    <VButton
                      variant="ghost"
                      type="button"
                      onClick={() => setStage(stage === 2 ? 1 : 0)}
                    >
                      <ArrowLeft size={15} aria-hidden="true" /> Back
                    </VButton>
                  )}
                  <VButton variant="verdant" type="submit" disabled={busy}>
                    {busy ? (
                      "Preparing transaction…"
                    ) : stage === 2 ? (
                      "Review transaction"
                    ) : (
                      <>
                        Next <ArrowRight size={15} aria-hidden="true" />
                      </>
                    )}
                  </VButton>
                </div>
              </footer>
            </form>
          )}
        </section>
      )}
    </div>
  );
}
