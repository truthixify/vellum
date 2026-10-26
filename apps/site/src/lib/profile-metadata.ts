import { profilePath, profileRouteFromPath } from "./profile-route.js";

const PROFILE_ORIGIN = "https://usevellum.xyz";
const DID_CKB_PATTERN = /^did:ckb:[a-zA-Z2-7]{32}$/;

export type ProfileMetadata = {
  title: string;
  description: string;
  canonicalUrl: string;
};

export function canonicalProfileDid(value: string | undefined): string | undefined {
  return value && DID_CKB_PATTERN.test(value) ? value : undefined;
}

export function profileMetadataFromPath(pathname: string): ProfileMetadata {
  const route = profileRouteFromPath(pathname);
  const did = route?.kind === "profile" ? canonicalProfileDid(route.did) : undefined;
  return {
    title: did ? "Public did:ckb profile | Vellum" : "Public profiles | Vellum",
    description: did
      ? "View this public did:ckb identity, its verified accounts, Claim Cells, and current reputation on Nervos CKB."
      : "Look up a public did:ckb identity, its verified accounts, Claim Cells, and current reputation on Nervos CKB.",
    canonicalUrl: did ? `${PROFILE_ORIGIN}${profilePath(did)}` : `${PROFILE_ORIGIN}/profile`,
  };
}

function replaceTag(html: string, pattern: RegExp, replacement: string): string {
  return pattern.test(html) ? html.replace(pattern, replacement) : html;
}

export function applyProfileMetadata(html: string, metadata: ProfileMetadata): string {
  let result = html;
  result = replaceTag(result, /<title>[\s\S]*?<\/title>/i, `<title>${metadata.title}</title>`);
  result = replaceTag(
    result,
    /<meta\s+name="description"\s+content="[^"]*"\s*\/?>/i,
    `<meta name="description" content="${metadata.description}" />`,
  );
  result = replaceTag(
    result,
    /<link\s+rel="canonical"\s+href="[^"]*"\s*\/?>/i,
    `<link rel="canonical" href="${metadata.canonicalUrl}" />`,
  );
  result = replaceTag(
    result,
    /<meta\s+property="og:title"\s+content="[^"]*"\s*\/?>/i,
    `<meta property="og:title" content="${metadata.title}" />`,
  );
  result = replaceTag(
    result,
    /<meta\s+property="og:description"\s+content="[^"]*"\s*\/?>/i,
    `<meta property="og:description" content="${metadata.description}" />`,
  );
  result = replaceTag(
    result,
    /<meta\s+property="og:url"\s+content="[^"]*"\s*\/?>/i,
    `<meta property="og:url" content="${metadata.canonicalUrl}" />`,
  );
  result = replaceTag(
    result,
    /<meta\s+name="twitter:title"\s+content="[^"]*"\s*\/?>/i,
    `<meta name="twitter:title" content="${metadata.title}" />`,
  );
  return replaceTag(
    result,
    /<meta\s+name="twitter:description"\s+content="[^"]*"\s*\/?>/i,
    `<meta name="twitter:description" content="${metadata.description}" />`,
  );
}
