import { ccc } from "@ckb-ccc/core";
import { isDidCkb, resolveDidCkb } from "@ckb-ccc/did-ckb";
import {
  AlertCircle,
  Check,
  ClipboardPaste,
  Copy,
  ExternalLink,
  Search,
} from "lucide-react";
import {
  AvatarMark,
  Button,
  NetworkStatus,
  StatusMark,
  useCopyFeedback,
} from "@vellum/ui";
import { useMemo, useState } from "react";
import { dashboardUrl } from "../config";

type ResolveState =
  "idle" | "loading" | "resolved" | "invalid" | "not-found" | "error";
type ResolvedRecord = NonNullable<Awaited<ReturnType<typeof resolveDidCkb>>>;

function documentFrom(record: ResolvedRecord): Record<string, unknown> {
  if (record.data.type !== "v1") return {};
  return record.data.value.document as Record<string, unknown>;
}

function profileFrom(document: Record<string, unknown>) {
  const services = document.services as
    Record<string, Record<string, unknown>> | undefined;
  const profile = services?.profile;
  return {
    displayName:
      typeof profile?.displayName === "string"
        ? profile.displayName
        : undefined,
    bio: typeof profile?.bio === "string" ? profile.bio : undefined,
  };
}

export function Resolver() {
  const params = useMemo(() => new URLSearchParams(window.location.search), []);
  const [query, setQuery] = useState(params.get("did") ?? "");
  const [state, setState] = useState<ResolveState>("idle");
  const [record, setRecord] = useState<ResolvedRecord | null>(null);
  const [message, setMessage] = useState("");

  async function resolve(event: React.FormEvent) {
    event.preventDefault();
    const did = query.trim();
    setRecord(null);
    setMessage("");
    if (!isDidCkb(did)) {
      setState("invalid");
      return;
    }
    setState("loading");
    try {
      const result = await resolveDidCkb({
        client: new ccc.ClientPublicTestnet(),
        did,
      });
      if (!result) {
        setState("not-found");
        return;
      }
      setRecord(result);
      setState("resolved");
      window.history.replaceState(
        null,
        "",
        `/resolve?did=${encodeURIComponent(did)}`,
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
      setState("error");
    }
  }

  async function paste() {
    try {
      setQuery(await navigator.clipboard.readText());
    } catch {
      setMessage("Clipboard access is unavailable in this browser.");
      setState("error");
    }
  }

  return (
    <section className="resolver-page">
      <div className="resolver-page__inner">
        <h1>Resolve a DID</h1>
        <p>
          Enter a Vellum identifier to read its current identity record directly
          from CKB Testnet.
        </p>
        <form className="resolver-form" onSubmit={resolve}>
          <label htmlFor="did-input">Identifier</label>
          <div className="resolver-form__row">
            <div className="resolver-input-wrap">
              <input
                id="did-input"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="did:ckb:..."
                autoComplete="off"
                spellCheck={false}
              />
              <button
                type="button"
                title="Paste identifier"
                aria-label="Paste identifier"
                onClick={() => void paste()}
              >
                <ClipboardPaste size={14} />
              </button>
            </div>
            <Button
              variant="primary"
              type="submit"
              disabled={state === "loading"}
            >
              {state === "loading" ? "Resolving" : "Resolve"}
            </Button>
          </div>
          <small>
            Format{" "}
            <span className="mono">did:ckb:&lt;base32 identifier&gt;</span> -
            resolved against CKB Testnet
          </small>
        </form>
        <div className="resolver-network">
          <NetworkStatus />
          <span>Identity resolution is live. Reputation is not inferred.</span>
        </div>
        <ResolverResult state={state} record={record} message={message} />
      </div>
    </section>
  );
}

function ResolverResult({
  state,
  record,
  message,
}: {
  state: ResolveState;
  record: ResolvedRecord | null;
  message: string;
}) {
  if (state === "idle") {
    return (
      <div className="resolver-empty">
        <Search size={24} strokeWidth={1.5} />
        <strong>Enter a did:ckb identifier</strong>
        <span>Public identity records are free to read.</span>
      </div>
    );
  }
  if (state === "loading") {
    return (
      <div className="resolver-loading" role="status">
        <span />
        <span />
        <span />
        <p>Resolving on CKB Testnet.</p>
      </div>
    );
  }
  if (state === "invalid") {
    return (
      <div className="notice notice--danger">
        <AlertCircle size={15} />
        <div>
          <strong>This identifier is not a valid DID.</strong>
          <p>
            Expected a value accepted by the current did:ckb identifier codec.
            Your input remains in the field.
          </p>
        </div>
      </div>
    );
  }
  if (state === "not-found") {
    return (
      <div className="notice">
        <Search size={15} />
        <div>
          <strong>This DID could not be resolved on CKB Testnet.</strong>
          <p>
            No live DID Metadata Cell matches this identifier. Check the network
            or identifier.
          </p>
          <a
            className="v-button v-button--secondary"
            href={dashboardUrl("/claim")}
          >
            Claim an identity
          </a>
        </div>
      </div>
    );
  }
  if (state === "error") {
    return (
      <div className="notice notice--warning">
        <AlertCircle size={15} />
        <div>
          <strong>The resolver is unavailable.</strong>
          <p>
            {message || "The request failed before a record could be returned."}
          </p>
        </div>
      </div>
    );
  }
  if (!record) return null;
  return <ResolvedIdentity record={record} />;
}

function ResolvedIdentity({ record }: { record: ResolvedRecord }) {
  const document = documentFrom(record);
  const profile = profileFrom(document);
  const did = record.did;
  const name = profile.displayName ?? "Unnamed identity";
  const initials =
    name === "Unnamed identity"
      ? did.slice(-2).toUpperCase()
      : name
          .split(/\s+/)
          .map((part) => part[0])
          .join("")
          .slice(0, 2)
          .toUpperCase();
  const verificationMethods = Object.keys(
    (document.verificationMethods as object | undefined) ?? {},
  );
  const services = Object.keys((document.services as object | undefined) ?? {});
  const handles = Array.isArray(document.alsoKnownAs)
    ? document.alsoKnownAs
    : [];
  const { copied, copy } = useCopyFeedback();

  return (
    <div className="resolved-record">
      <div className="resolved-record__hero">
        <AvatarMark>{initials}</AvatarMark>
        <div>
          <strong>{name}</strong>
          <span className="mono">{did} - resolved just now</span>
        </div>
        <StatusMark tone="positive">Active</StatusMark>
        <button
          className="v-icon-button"
          onClick={() => void copy(did)}
          title="Copy DID"
          aria-label="Copy DID"
        >
          <Copy size={15} />
          {copied && <span className="sr-only">Copied</span>}
        </button>
      </div>
      {profile.bio && <p className="resolved-record__bio">{profile.bio}</p>}
      <dl className="resolved-record__facts">
        <div>
          <dt>Verification methods</dt>
          <dd className="mono">{verificationMethods.length}</dd>
        </div>
        <div>
          <dt>Linked identities</dt>
          <dd className="mono">{handles.length}</dd>
        </div>
        <div>
          <dt>Services</dt>
          <dd className="mono">{services.length}</dd>
        </div>
        <div>
          <dt>Reputation</dt>
          <dd>Not calculated</dd>
        </div>
      </dl>
      <div className="resolved-record__footer">
        <span>Resolved with @ckb-ccc/did-ckb</span>
        <a href={dashboardUrl(`/resolve?did=${encodeURIComponent(did)}`)}>
          Inspect in dashboard <ExternalLink size={13} />
        </a>
      </div>
    </div>
  );
}
