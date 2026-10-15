import type { Claim } from "@usevellum/sdk";
import {
  blueskyIdentitySchema,
  discordCommunitySchema,
  discordIdentitySchema,
  githubContributionSchema,
  githubIdentitySchema,
  parseBlueskyClaimPayload,
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
import { AlertCircle, ArrowUpRight, Braces } from "lucide-react";
import type { ReactElement, ReactNode } from "react";

type ClaimRendererProps = { claim: Claim };

type ClaimRenderer = (props: ClaimRendererProps) => ReactElement;

type ClaimRendererRegistration = {
  schemaHash: string;
  schemaId: string;
  renderer: ClaimRenderer;
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

function truncate(value: string, maximum: number): string {
  return value.length <= maximum ? value : `${value.slice(0, maximum)} [truncated]`;
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
    const entries = Array.from(value.entries()).slice(0, RAW_MAX_ITEMS);
    const preview = entries.map(([key, item]) => ({
      key: previewValue(key, depth + 1, context),
      value: previewValue(item, depth + 1, context),
    }));
    if (value.size > RAW_MAX_ITEMS) preview.push({ key: "[truncated]", value: value.size });
    return preview;
  }

  if (value instanceof Set) {
    const entries = Array.from(value.values()).slice(0, RAW_MAX_ITEMS);
    const preview = entries.map((item) => previewValue(item, depth + 1, context));
    if (value.size > RAW_MAX_ITEMS) preview.push(`[${value.size - RAW_MAX_ITEMS} more items]`);
    return preview;
  }

  const keys = Object.keys(value).sort();
  const preview: Record<string, PreviewValue> = {};
  for (const key of keys.slice(0, RAW_MAX_ITEMS)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    const previewKey = truncate(key, RAW_MAX_KEY_LENGTH);
    preview[previewKey] =
      descriptor && "value" in descriptor
        ? previewValue(descriptor.value, depth + 1, context)
        : "[accessor omitted]";
  }
  if (keys.length > RAW_MAX_ITEMS) {
    preview["[truncated fields]"] = keys.length - RAW_MAX_ITEMS;
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

function ClaimFrame({
  provider,
  schemaId,
  title,
  description,
  profileUrl,
  profileLabel,
  children,
}: {
  provider: VerificationProvider;
  schemaId: string;
  title: string;
  description: string;
  profileUrl?: string;
  profileLabel?: string;
  children?: ReactNode;
}) {
  return (
    <div className="claim-renderer">
      <span className="claim-renderer__mark">
        <ProviderMark provider={provider} size={18} />
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

function GithubIdentityClaim({ claim }: ClaimRendererProps) {
  const payload = parseGithubClaimPayload(claim.payload);
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

function DiscordIdentityClaim({ claim }: ClaimRendererProps) {
  const payload = parseDiscordClaimPayload(claim.payload);
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

function TelegramIdentityClaim({ claim }: ClaimRendererProps) {
  const payload = parseTelegramClaimPayload(claim.payload);
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

function BlueskyIdentityClaim({ claim }: ClaimRendererProps) {
  const payload = parseBlueskyClaimPayload(claim.payload);
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

function GithubContributionClaim({ claim }: ClaimRendererProps) {
  const payload = parseGithubContributionClaimPayload(claim.payload);
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

function DiscordCommunityClaim({ claim }: ClaimRendererProps) {
  const payload = parseDiscordCommunityClaimPayload(claim.payload);
  return (
    <ClaimFrame
      provider="discord"
      schemaId={discordCommunitySchema.id}
      title={formatCount(
        payload.memberships.length,
        "recognized community",
        "recognized communities",
      )}
      description="Current Discord community evidence recorded by the issuer."
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

function TelegramCommunityClaim({ claim }: ClaimRendererProps) {
  const payload = parseTelegramCommunityClaimPayload(claim.payload);
  return (
    <ClaimFrame
      provider="telegram"
      schemaId={telegramCommunitySchema.id}
      title={formatCount(
        payload.memberships.length,
        "recognized community",
        "recognized communities",
      )}
      description="Current Telegram community evidence recorded by the issuer."
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

const registrations = [
  {
    schemaHash: githubIdentitySchema.hash,
    schemaId: githubIdentitySchema.id,
    renderer: GithubIdentityClaim,
  },
  {
    schemaHash: discordIdentitySchema.hash,
    schemaId: discordIdentitySchema.id,
    renderer: DiscordIdentityClaim,
  },
  {
    schemaHash: telegramIdentitySchema.hash,
    schemaId: telegramIdentitySchema.id,
    renderer: TelegramIdentityClaim,
  },
  {
    schemaHash: blueskyIdentitySchema.hash,
    schemaId: blueskyIdentitySchema.id,
    renderer: BlueskyIdentityClaim,
  },
  {
    schemaHash: githubContributionSchema.hash,
    schemaId: githubContributionSchema.id,
    renderer: GithubContributionClaim,
  },
  {
    schemaHash: discordCommunitySchema.hash,
    schemaId: discordCommunitySchema.id,
    renderer: DiscordCommunityClaim,
  },
  {
    schemaHash: telegramCommunitySchema.hash,
    schemaId: telegramCommunitySchema.id,
    renderer: TelegramCommunityClaim,
  },
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

  try {
    return registration.renderer({ claim });
  } catch {
    return <InvalidRegisteredClaim claim={claim} registration={registration} />;
  }
}
