import type { Claim } from "@usevellum/sdk";
import {
  blueskyIdentitySchema,
  ckboostQuestSchema,
  discordCommunitySchema,
  discordIdentitySchema,
  githubContributionSchema,
  githubIdentitySchema,
  parseBlueskyClaimPayload,
  parseCkboostQuestClaimPayload,
  parseDiscordClaimPayload,
  parseDiscordCommunityClaimPayload,
  parseGithubClaimPayload,
  parseGithubContributionClaimPayload,
  parseTelegramClaimPayload,
  parseTelegramCommunityClaimPayload,
  telegramCommunitySchema,
  telegramIdentitySchema,
  type GithubContributionArtifact,
} from "@vellum/schemas";
import { ProviderMark, type VerificationProvider } from "@vellum/ui";
import { AlertCircle, ArrowUpRight, Braces, Trophy } from "lucide-react";
import type { ReactElement, ReactNode } from "react";

type ClaimRendererProps = { claim: Claim };

type ClaimSchemaDefinition = {
  hash: string;
  id: string;
};

type ClaimRendererRegistration = {
  schemaHash: string;
  schemaId: string;
  prepare: (payload: unknown) => () => ReactElement;
};

type PreviewValue =
  | null
  | boolean
  | number
  | string
  | PreviewValue[]
  | { [key: string]: PreviewValue };

type PreviewContext = {
  remaining: number;
  seen: WeakSet<object>;
};

const DATE_FORMATTER = new Intl.DateTimeFormat("en", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});
const RAW_MAX_DEPTH = 4;
const RAW_MAX_ITEMS = 24;
const RAW_MAX_NODES = 128;
const RAW_MAX_STRING_LENGTH = 256;
const RAW_MAX_KEY_LENGTH = 96;
const RAW_MAX_OUTPUT_LENGTH = 12_000;
const RAW_MAX_BYTES = 64;
const TESTNET_TRANSACTION_EXPLORER = "https://pudge.explorer.nervos.org/transaction/";

function truncate(value: string, maximum: number): string {
  if (value.length <= maximum) return value;
  const suffix = " [truncated]";
  return `${value.slice(0, Math.max(0, maximum - suffix.length))}${suffix}`;
}

function uniquePreviewKey(preview: Record<string, PreviewValue>, sourceKey: string): string {
  const base = truncate(sourceKey, RAW_MAX_KEY_LENGTH);
  if (!Object.hasOwn(preview, base)) return base;

  for (let index = 2; index <= RAW_MAX_ITEMS + 1; index += 1) {
    const suffix = ` [${index}]`;
    const candidate = `${base.slice(0, RAW_MAX_KEY_LENGTH - suffix.length)}${suffix}`;
    if (!Object.hasOwn(preview, candidate)) return candidate;
  }
  return `[field ${Object.keys(preview).length + 1}]`;
}

function bytesPreview(value: ArrayBuffer | ArrayBufferView): string {
  const bytes =
    value instanceof ArrayBuffer
      ? new Uint8Array(value)
      : new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  const visible = bytes.subarray(0, RAW_MAX_BYTES);
  const hex = Array.from(visible, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return bytes.length > visible.length ? `0x${hex} [${bytes.length} bytes]` : `0x${hex}`;
}

function previewValue(value: unknown, depth: number, context: PreviewContext): PreviewValue {
  if (context.remaining <= 0) return "[value limit reached]";
  context.remaining -= 1;

  if (value === null) return null;
  if (typeof value === "string") return truncate(value, RAW_MAX_STRING_LENGTH);
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return Number.isFinite(value) ? value : String(value);
  if (typeof value === "bigint") return `${value.toString()}n`;
  if (typeof value === "undefined") return "[undefined]";
  if (typeof value === "symbol" || typeof value === "function") {
    return `[${typeof value} omitted]`;
  }
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? "[invalid date]" : value.toISOString();
  }
  if (value instanceof ArrayBuffer || ArrayBuffer.isView(value)) return bytesPreview(value);
  if (context.seen.has(value)) return "[circular reference]";
  if (depth >= RAW_MAX_DEPTH) return "[depth limit reached]";
  context.seen.add(value);

  if (Array.isArray(value)) {
    const preview = value
      .slice(0, RAW_MAX_ITEMS)
      .map((item) => previewValue(item, depth + 1, context));
    if (value.length > RAW_MAX_ITEMS) {
      preview.push(`[${value.length - RAW_MAX_ITEMS} more items]`);
    }
    return preview;
  }

  if (value instanceof Map) {
    const preview: PreviewValue[] = [];
    const iterator = value.entries();
    for (let index = 0; index < RAW_MAX_ITEMS; index += 1) {
      const entry = iterator.next();
      if (entry.done) break;
      preview.push({
        key: previewValue(entry.value[0], depth + 1, context),
        value: previewValue(entry.value[1], depth + 1, context),
      });
    }
    if (value.size > RAW_MAX_ITEMS) preview.push({ key: "[truncated]", value: value.size });
    return preview;
  }

  if (value instanceof Set) {
    const preview: PreviewValue[] = [];
    const iterator = value.values();
    for (let index = 0; index < RAW_MAX_ITEMS; index += 1) {
      const entry = iterator.next();
      if (entry.done) break;
      preview.push(previewValue(entry.value, depth + 1, context));
    }
    if (value.size > RAW_MAX_ITEMS) preview.push(`[${value.size - RAW_MAX_ITEMS} more items]`);
    return preview;
  }

  const keys = Object.keys(value).sort();
  const preview: Record<string, PreviewValue> = Object.create(null);
  for (const key of keys.slice(0, RAW_MAX_ITEMS)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    const previewKey = uniquePreviewKey(preview, key);
    preview[previewKey] =
      descriptor && "value" in descriptor
        ? previewValue(descriptor.value, depth + 1, context)
        : "[accessor omitted]";
  }
  if (keys.length > RAW_MAX_ITEMS) {
    preview[uniquePreviewKey(preview, "[truncated fields]")] = keys.length - RAW_MAX_ITEMS;
  }
  return preview;
}

function formatBoundedClaimPayload(value: unknown): string {
  try {
    const preview = previewValue(value, 0, {
      remaining: RAW_MAX_NODES,
      seen: new WeakSet<object>(),
    });
    const output = JSON.stringify(preview, null, 2);
    return output.length <= RAW_MAX_OUTPUT_LENGTH
      ? output
      : `${output.slice(0, RAW_MAX_OUTPUT_LENGTH)}\n[output truncated]`;
  } catch {
    return '"[payload unavailable]"';
  }
}

function formatTimestamp(value: number): string {
  const date = new Date(value * 1_000);
  return Number.isNaN(date.getTime()) ? "Unknown date" : DATE_FORMATTER.format(date);
}

function formatCount(value: number, singular: string, plural = `${singular}s`): string {
  return `${value} ${value === 1 ? singular : plural}`;
}

function titleCase(value: string): string {
  const normalized = value.replaceAll("_", " ");
  return `${normalized.charAt(0).toUpperCase()}${normalized.slice(1)}`;
}

function ClaimFacts({ facts }: { facts: readonly { label: string; value: ReactNode }[] }) {
  return (
    <dl className="claim-renderer__facts">
      {facts.map((fact) => (
        <div key={fact.label}>
          <dt>{fact.label}</dt>
          <dd>{fact.value}</dd>
        </div>
      ))}
    </dl>
  );
}

type ClaimFrameMark =
  | { mark: ReactElement; provider?: never }
  | { mark?: never; provider: VerificationProvider };

type ClaimFrameProps = ClaimFrameMark & {
  schemaId: string;
  title: string;
  description: string;
  profileUrl?: string;
  profileLabel?: string;
  children?: ReactNode;
};

function ClaimFrame({
  provider,
  mark,
  schemaId,
  title,
  description,
  profileUrl,
  profileLabel,
  children,
}: ClaimFrameProps) {
  return (
    <div className="claim-renderer">
      <span className="claim-renderer__mark">
        {mark ?? (provider ? <ProviderMark provider={provider} size={18} /> : null)}
      </span>
      <div className="claim-renderer__content">
        <div className="claim-renderer__header">
          <span className="claim-renderer__title">
            <small>{schemaId}</small>
            <strong>{title}</strong>
            <span>{description}</span>
          </span>
          {profileUrl && (
            <a href={profileUrl} target="_blank" rel="noreferrer">
              {profileLabel ?? "Open profile"}
              <ArrowUpRight size={13} aria-hidden="true" />
            </a>
          )}
        </div>
        {children}
      </div>
    </div>
  );
}

function RawPayloadDetails({ payload }: { payload: unknown }) {
  return (
    <details className="claim-renderer__details">
      <summary>View bounded raw payload</summary>
      <pre>{formatBoundedClaimPayload(payload)}</pre>
    </details>
  );
}

function UnknownClaimRenderer({ claim }: ClaimRendererProps) {
  return (
    <div className="claim-renderer claim-renderer--fallback">
      <span className="claim-renderer__mark">
        <Braces size={18} aria-hidden="true" />
      </span>
      <div className="claim-renderer__content">
        <span className="claim-renderer__title">
          <small>Unregistered schema</small>
          <strong>Raw Claim Cell payload</strong>
          <span>No trusted renderer is registered for this schema hash.</span>
        </span>
        <RawPayloadDetails payload={claim.payload} />
      </div>
    </div>
  );
}

function InvalidRegisteredClaim({
  claim,
  registration,
}: {
  claim: Claim;
  registration: ClaimRendererRegistration;
}) {
  return (
    <div className="claim-renderer claim-renderer--fallback">
      <span className="claim-renderer__mark claim-renderer__mark--warning">
        <AlertCircle size={18} aria-hidden="true" />
      </span>
      <div className="claim-renderer__content">
        <span className="claim-renderer__title">
          <small>{registration.schemaId}</small>
          <strong>Registered payload unavailable</strong>
          <span>The payload does not match the schema pinned to this hash.</span>
        </span>
        <RawPayloadDetails payload={claim.payload} />
      </div>
    </div>
  );
}

function renderGithubIdentityClaim(payload: ReturnType<typeof parseGithubClaimPayload>) {
  return (
    <ClaimFrame
      provider="github"
      schemaId={githubIdentitySchema.id}
      title={`@${payload.login}`}
      description="GitHub account control recorded by the issuer."
      profileUrl={payload.profile_url}
      profileLabel="GitHub profile"
    >
      <ClaimFacts
        facts={[
          { label: "Account since", value: formatTimestamp(payload.account_created_at) },
          { label: "Verified", value: formatTimestamp(payload.verified_at) },
          { label: "GitHub user ID", value: payload.user_id },
        ]}
      />
    </ClaimFrame>
  );
}

function renderDiscordIdentityClaim(payload: ReturnType<typeof parseDiscordClaimPayload>) {
  return (
    <ClaimFrame
      provider="discord"
      schemaId={discordIdentitySchema.id}
      title={payload.username}
      description="Discord account control recorded by the issuer."
      profileUrl={payload.profile_url}
      profileLabel="Discord profile"
    >
      <ClaimFacts
        facts={[
          { label: "Account since", value: formatTimestamp(payload.account_created_at) },
          { label: "Verified", value: formatTimestamp(payload.verified_at) },
          { label: "Discord user ID", value: payload.user_id },
        ]}
      />
    </ClaimFrame>
  );
}

function renderTelegramIdentityClaim(payload: ReturnType<typeof parseTelegramClaimPayload>) {
  return (
    <ClaimFrame
      provider="telegram"
      schemaId={telegramIdentitySchema.id}
      title={payload.username ? `@${payload.username}` : payload.display_name}
      description={
        payload.username
          ? `${payload.display_name} linked a public Telegram account.`
          : `${payload.display_name} linked a Telegram account without a public username.`
      }
      profileUrl={payload.profile_url}
      profileLabel="Telegram profile"
    >
      <ClaimFacts
        facts={[
          { label: "Display name", value: payload.display_name },
          { label: "Verified", value: formatTimestamp(payload.verified_at) },
          { label: "Telegram user ID", value: payload.user_id },
        ]}
      />
    </ClaimFrame>
  );
}

function renderBlueskyIdentityClaim(payload: ReturnType<typeof parseBlueskyClaimPayload>) {
  return (
    <ClaimFrame
      provider="bluesky"
      schemaId={blueskyIdentitySchema.id}
      title={`@${payload.handle}`}
      description="Bluesky account control recorded against a stable AT Protocol DID."
      profileUrl={payload.profile_url}
      profileLabel="Bluesky profile"
    >
      <ClaimFacts
        facts={[
          { label: "AT Protocol DID", value: payload.did },
          { label: "Verified", value: formatTimestamp(payload.verified_at) },
          { label: "Handle", value: payload.handle },
        ]}
      />
    </ClaimFrame>
  );
}

function renderCkboostQuestClaim(payload: ReturnType<typeof parseCkboostQuestClaimPayload>) {
  return (
    <ClaimFrame
      mark={<Trophy size={18} aria-hidden="true" />}
      schemaId={ckboostQuestSchema.id}
      title={payload.quest_title}
      description={`Reward claimed for ${payload.campaign_title}.`}
      profileUrl={`${TESTNET_TRANSACTION_EXPLORER}${payload.reward_claim_tx_hash}`}
      profileLabel="Reward claim"
    >
      <ClaimFacts
        facts={[
          { label: "Completed", value: formatTimestamp(payload.completed_at) },
          { label: "Points", value: payload.points_awarded },
          { label: "Quest ID", value: payload.quest_id },
        ]}
      />
      <ul className="claim-renderer__records">
        <li>
          <span>
            <strong>{payload.campaign_title}</strong>
            <small>Campaign Type ID {payload.campaign_type_id}</small>
          </span>
          <a
            href={`${TESTNET_TRANSACTION_EXPLORER}${payload.approval_tx_hash}`}
            target="_blank"
            rel="noreferrer"
          >
            Approval <ArrowUpRight size={13} aria-hidden="true" />
          </a>
        </li>
      </ul>
    </ClaimFrame>
  );
}

function ArtifactRow({ artifact }: { artifact: GithubContributionArtifact }) {
  return (
    <li>
      <span>
        <strong>{artifact.title}</strong>
        <small>
          {artifact.repository} / #{artifact.number} / {formatTimestamp(artifact.occurred_at)}
        </small>
        <span className="claim-renderer__tags">
          <span>{titleCase(artifact.classification)}</span>
          <span>
            {artifact.kind === "merged_pull_request"
              ? "Merged pull request"
              : "Pull request review"}
          </span>
        </span>
      </span>
      <a href={artifact.url} target="_blank" rel="noreferrer">
        View work <ArrowUpRight size={13} aria-hidden="true" />
      </a>
    </li>
  );
}

function renderGithubContributionClaim(
  payload: ReturnType<typeof parseGithubContributionClaimPayload>,
) {
  return (
    <ClaimFrame
      provider="github"
      schemaId={githubContributionSchema.id}
      title={`${formatCount(payload.eligible_artifact_count, "eligible artifact")}`}
      description={`Public CKB work attributed to @${payload.login} during the verification window.`}
      profileUrl={`https://github.com/${payload.login}`}
      profileLabel="GitHub profile"
    >
      <ClaimFacts
        facts={[
          { label: "Window started", value: formatTimestamp(payload.window_started_at) },
          { label: "Verified", value: formatTimestamp(payload.verified_at) },
          { label: "Recorded on-chain", value: formatCount(payload.artifacts.length, "artifact") },
        ]}
      />
      <details className="claim-renderer__details">
        <summary>{formatCount(payload.artifacts.length, "recorded artifact")}</summary>
        <ul className="claim-renderer__records">
          {payload.artifacts.map((artifact) => (
            <ArtifactRow artifact={artifact} key={artifact.artifact_id} />
          ))}
        </ul>
      </details>
    </ClaimFrame>
  );
}

function renderDiscordCommunityClaim(
  payload: ReturnType<typeof parseDiscordCommunityClaimPayload>,
) {
  return (
    <ClaimFrame
      provider="discord"
      schemaId={discordCommunitySchema.id}
      title={formatCount(
        payload.memberships.length,
        "recognized community",
        "recognized communities",
      )}
      description="Discord community membership recorded by the issuer."
    >
      <ClaimFacts
        facts={[
          { label: "Verified", value: formatTimestamp(payload.verified_at) },
          { label: "Discord user ID", value: payload.user_id },
          { label: "Communities", value: payload.memberships.length },
        ]}
      />
      <ul className="claim-renderer__records">
        {payload.memberships.map((membership) => (
          <li key={membership.guild_id}>
            <span>
              <strong>{membership.community_name}</strong>
              <small>Joined {formatTimestamp(membership.joined_at)}</small>
              <span className="claim-renderer__tags">
                {membership.recognized_roles.length > 0 ? (
                  membership.recognized_roles.map((role) => (
                    <span key={role.role_id}>{role.role_name}</span>
                  ))
                ) : (
                  <span>Member</span>
                )}
              </span>
            </span>
          </li>
        ))}
      </ul>
    </ClaimFrame>
  );
}

function renderTelegramCommunityClaim(
  payload: ReturnType<typeof parseTelegramCommunityClaimPayload>,
) {
  return (
    <ClaimFrame
      provider="telegram"
      schemaId={telegramCommunitySchema.id}
      title={formatCount(
        payload.memberships.length,
        "recognized community",
        "recognized communities",
      )}
      description="Telegram community membership recorded by the issuer."
    >
      <ClaimFacts
        facts={[
          { label: "Verified", value: formatTimestamp(payload.verified_at) },
          { label: "Telegram user ID", value: payload.user_id },
          { label: "Communities", value: payload.memberships.length },
        ]}
      />
      <ul className="claim-renderer__records">
        {payload.memberships.map((membership) => (
          <li key={membership.chat_id}>
            <span>
              <strong>{membership.community_name}</strong>
              <small>{titleCase(membership.community_type)}</small>
              <span className="claim-renderer__tags">
                <span>{titleCase(membership.member_role)}</span>
              </span>
            </span>
          </li>
        ))}
      </ul>
    </ClaimFrame>
  );
}

function defineClaimRenderer<TPayload>(
  schema: ClaimSchemaDefinition,
  parse: (payload: unknown) => TPayload,
  render: (payload: TPayload) => ReactElement,
): ClaimRendererRegistration {
  return {
    schemaHash: schema.hash,
    schemaId: schema.id,
    prepare(payload) {
      const parsed = parse(payload);
      return () => render(parsed);
    },
  };
}

const registrations = [
  defineClaimRenderer(ckboostQuestSchema, parseCkboostQuestClaimPayload, renderCkboostQuestClaim),
  defineClaimRenderer(githubIdentitySchema, parseGithubClaimPayload, renderGithubIdentityClaim),
  defineClaimRenderer(discordIdentitySchema, parseDiscordClaimPayload, renderDiscordIdentityClaim),
  defineClaimRenderer(
    telegramIdentitySchema,
    parseTelegramClaimPayload,
    renderTelegramIdentityClaim,
  ),
  defineClaimRenderer(blueskyIdentitySchema, parseBlueskyClaimPayload, renderBlueskyIdentityClaim),
  defineClaimRenderer(
    githubContributionSchema,
    parseGithubContributionClaimPayload,
    renderGithubContributionClaim,
  ),
  defineClaimRenderer(
    discordCommunitySchema,
    parseDiscordCommunityClaimPayload,
    renderDiscordCommunityClaim,
  ),
  defineClaimRenderer(
    telegramCommunitySchema,
    parseTelegramCommunityClaimPayload,
    renderTelegramCommunityClaim,
  ),
] satisfies readonly ClaimRendererRegistration[];

function createRendererRegistry(
  definitions: readonly ClaimRendererRegistration[],
): Readonly<Record<string, ClaimRendererRegistration>> {
  const registry: Record<string, ClaimRendererRegistration> = Object.create(null);
  for (const definition of definitions) {
    if (Object.hasOwn(registry, definition.schemaHash)) {
      throw new Error(`Duplicate claim renderer for ${definition.schemaHash}`);
    }
    registry[definition.schemaHash] = Object.freeze(definition);
  }
  return Object.freeze(registry);
}

const claimRendererRegistry = createRendererRegistry(registrations);

function getClaimRenderer(schemaHash: string): ClaimRendererRegistration | undefined {
  return Object.hasOwn(claimRendererRegistry, schemaHash)
    ? claimRendererRegistry[schemaHash]
    : undefined;
}

export function ClaimPayloadRenderer({ claim }: ClaimRendererProps) {
  const registration = getClaimRenderer(claim.schemaHash);
  if (!registration) return <UnknownClaimRenderer claim={claim} />;

  let render: () => ReactElement;
  try {
    render = registration.prepare(claim.payload);
  } catch {
    return <InvalidRegisteredClaim claim={claim} registration={registration} />;
  }
  return render();
}
