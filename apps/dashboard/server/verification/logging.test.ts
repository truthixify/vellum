import { describe, expect, spyOn, test } from "bun:test";

import { logVerificationFailure } from "./logging";

describe("verification failure logging", () => {
  test("records useful context without exposing credentials or 32-byte secrets", () => {
    const output = spyOn(console, "error").mockImplementation(() => undefined);
    try {
      logVerificationFailure({
        error: new Error(
          `submission failed for 0x${"ab".repeat(32)} using abcd-efgh-ijkl-mnop\nnext line`,
        ),
        platform: "bluesky",
        requestId: "request-1",
        stage: "issuance",
      });

      expect(output).toHaveBeenCalledTimes(1);
      expect(JSON.parse(String(output.mock.calls[0][0]))).toEqual({
        event: "verification_failure",
        error: "submission failed for [redacted] using [redacted] next line",
        errorName: "Error",
        platform: "bluesky",
        requestId: "request-1",
        stage: "issuance",
      });
    } finally {
      output.mockRestore();
    }
  });
});
