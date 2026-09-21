import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";

import { DiscordOAuthError, GithubOAuthError, OAuthConfigurationError } from "./errors";
import {
  DISCORD_OAUTH_COOKIE_NAME,
  DISCORD_OAUTH_STATE_TTL_SECONDS,
  GITHUB_OAUTH_COOKIE_NAME,
  GITHUB_OAUTH_STATE_TTL_SECONDS,
  clearGithubOAuthCookie,
  clearDiscordOAuthCookie,
  consumeDiscordOAuthState,
  consumeGithubOAuthState,
  createGithubOAuthState,
  createDiscordOAuthState,
} from "./oauth-state";

const SUBJECT = { did: "did:ckb:fn7u37m7vwerr4ojysgdwwp4mescjtrp" } as const;
const SECRET = "state-secret-for-tests-only".repeat(2);
const NOW = 1_800_000_000;
const NONCE = () => Uint8Array.from({ length: 32 }, (_, index) => index);

function requestCookie(setCookie: string): string {
  return setCookie.split(";", 1)[0];
}

describe("GitHub OAuth state", () => {
  test("binds a five-minute state to one did:ckb subject", () => {
    const created = createGithubOAuthState(SUBJECT, SECRET, NOW, true, NONCE);

    expect(created.expiresAt).toBe(NOW + GITHUB_OAUTH_STATE_TTL_SECONDS);
    expect(created.cookie).toContain("HttpOnly");
    expect(created.cookie).toContain("SameSite=Lax");
    expect(created.cookie).toContain("Secure");
    const consumed = consumeGithubOAuthState(
      requestCookie(created.cookie),
      created.state,
      SECRET,
      NOW + 1,
    );
    expect(consumed.subject).toEqual(SUBJECT);
    expect(consumed.codeVerifier).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(created.codeChallenge).toBe(
      createHash("sha256").update(consumed.codeVerifier, "ascii").digest("base64url"),
    );
  });

  test("rejects missing, duplicated, tampered, mismatched, and expired state", () => {
    const created = createGithubOAuthState(SUBJECT, SECRET, NOW, true, NONCE);
    const cookie = requestCookie(created.cookie);
    const replacement = created.state.replace(/^./, created.state[0] === "A" ? "B" : "A");

    const attempts = [
      () => consumeGithubOAuthState(null, created.state, SECRET, NOW + 1),
      () =>
        consumeGithubOAuthState(
          `${cookie}; ${GITHUB_OAUTH_COOKIE_NAME}=duplicate`,
          created.state,
          SECRET,
          NOW + 1,
        ),
      () => consumeGithubOAuthState(`${cookie}x`, created.state, SECRET, NOW + 1),
      () => consumeGithubOAuthState(cookie, replacement, SECRET, NOW + 1),
      () =>
        consumeGithubOAuthState(
          cookie,
          created.state,
          SECRET,
          NOW + GITHUB_OAUTH_STATE_TTL_SECONDS,
        ),
    ];

    for (const attempt of attempts) {
      expect(attempt).toThrow(GithubOAuthError);
    }
  });

  test("fails closed on weak configuration and clears the exact cookie path", () => {
    expect(() => createGithubOAuthState(SUBJECT, "too-short", NOW, true, NONCE)).toThrow(
      OAuthConfigurationError,
    );
    expect(clearGithubOAuthCookie(true)).toBe(
      `${GITHUB_OAUTH_COOKIE_NAME}=; Path=/api/verify/github/callback; HttpOnly; SameSite=Lax; Max-Age=0; Secure`,
    );
    expect(clearGithubOAuthCookie(false)).not.toContain("Secure");
  });
});

describe("Discord OAuth state", () => {
  test("binds a five-minute state to the Discord callback cookie", () => {
    const created = createDiscordOAuthState(SUBJECT, SECRET, NOW, true, NONCE);

    expect(created.expiresAt).toBe(NOW + DISCORD_OAUTH_STATE_TTL_SECONDS);
    expect(created.cookie).toContain(`${DISCORD_OAUTH_COOKIE_NAME}=`);
    expect(created.cookie).toContain("Path=/api/verify/discord/callback");
    expect(
      consumeDiscordOAuthState(requestCookie(created.cookie), created.state, SECRET, NOW + 1),
    ).toEqual({ subject: SUBJECT });
    expect(() =>
      consumeDiscordOAuthState(
        requestCookie(created.cookie),
        created.state,
        SECRET,
        created.expiresAt,
      ),
    ).toThrow(DiscordOAuthError);
  });

  test("does not accept a GitHub state cookie and clears the exact Discord path", () => {
    const github = createGithubOAuthState(SUBJECT, SECRET, NOW, true, NONCE);
    expect(() =>
      consumeDiscordOAuthState(requestCookie(github.cookie), github.state, SECRET, NOW + 1),
    ).toThrow(DiscordOAuthError);
    expect(clearDiscordOAuthCookie(true)).toBe(
      `${DISCORD_OAUTH_COOKIE_NAME}=; Path=/api/verify/discord/callback; HttpOnly; SameSite=Lax; Max-Age=0; Secure`,
    );
  });
});
