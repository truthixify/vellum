const SECRET_HEX_PATTERN = /0x[0-9a-f]{64}/gi;
const BLUESKY_APP_PASSWORD_PATTERN = /\b[a-z0-9]{4}(?:-[a-z0-9]{4}){3}\b/gi;

function replaceControlCharacters(value: string): string {
  return [...value]
    .map((character) => {
      const code = character.codePointAt(0)!;
      return code <= 0x1f || code === 0x7f ? " " : character;
    })
    .join("");
}

function safeMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return replaceControlCharacters(
    message
      .replace(SECRET_HEX_PATTERN, "[redacted]")
      .replace(BLUESKY_APP_PASSWORD_PATTERN, "[redacted]"),
  ).slice(0, 512);
}

export type VerificationFailure = {
  error: unknown;
  platform: "github" | "discord" | "telegram" | "bluesky";
  requestId: string;
  stage: "challenge" | "start" | "provider" | "issuance" | "callback" | "submit";
};

export type VerificationFailureLogger = (failure: VerificationFailure) => void;

export const logVerificationFailure: VerificationFailureLogger = (failure) => {
  console.error(
    JSON.stringify({
      event: "verification_failure",
      error: safeMessage(failure.error),
      errorName: failure.error instanceof Error ? failure.error.name : "UnknownError",
      platform: failure.platform,
      requestId: failure.requestId,
      stage: failure.stage,
    }),
  );
};
