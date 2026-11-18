import { GOVERNANCE_API_VERSION } from "../../src/lib/governance-contracts.js";
import { RequestBodyError, parseJsonBody } from "../verification/http.js";
import { governanceChallengeRequestSchema, governanceVoteRequestSchema } from "./contracts.js";
import { GovernanceServiceError } from "./errors.js";
import { createGovernanceService, type GovernanceService } from "./service.js";

type GovernanceAction = "proposal" | "evaluate" | "challenge" | "vote" | "receipt";

function json(body: unknown, status = 200, headers?: HeadersInit): Response {
  return Response.json(body, {
    status,
    headers: { "cache-control": "no-store", ...headers },
  });
}

function errorResponse(
  status: number,
  code: string,
  message: string,
  headers?: HeadersInit,
): Response {
  return json(
    { ok: false, version: GOVERNANCE_API_VERSION, error: { code, message } },
    status,
    headers,
  );
}

export function governanceActionFromUrl(request: Request): string | undefined {
  const url = new URL(request.url);
  const segments = url.pathname.split("/").filter(Boolean);
  if (segments.length === 3 && segments[0] === "api" && segments[1] === "governance") {
    try {
      return decodeURIComponent(segments[2]);
    } catch {
      return undefined;
    }
  }
  if (segments.length === 2 && segments[0] === "api" && segments[1] === "governance") {
    const actions = url.searchParams.getAll("action");
    return actions.length === 0 ? "proposal" : actions.length === 1 ? actions[0] : undefined;
  }
  return undefined;
}

function isAction(value: string | undefined): value is GovernanceAction {
  return ["proposal", "evaluate", "challenge", "vote", "receipt"].includes(value ?? "");
}

function method(request: Request, expected: "GET" | "POST"): Response | undefined {
  if (request.method === expected) return undefined;
  return errorResponse(405, "method_not_allowed", `Use ${expected} for this governance action.`, {
    allow: expected,
  });
}

async function body(request: Request): Promise<unknown> {
  try {
    return await parseJsonBody(request);
  } catch (error) {
    if (error instanceof RequestBodyError) {
      throw new GovernanceServiceError("invalid_request", error.status, error.message);
    }
    throw new GovernanceServiceError(
      "invalid_request",
      400,
      "The request body must contain valid JSON.",
    );
  }
}

export async function handleGovernanceRequest(
  request: Request,
  service: GovernanceService = createGovernanceService(),
): Promise<Response> {
  const action = governanceActionFromUrl(request);
  if (!isAction(action)) {
    return errorResponse(404, "invalid_request", "The governance action is unknown.");
  }

  try {
    switch (action) {
      case "proposal": {
        const rejected = method(request, "GET");
        if (rejected) return rejected;
        return json({ ok: true, ...(await service.proposal()) });
      }
      case "evaluate": {
        const rejected = method(request, "GET");
        if (rejected) return rejected;
        const values = new URL(request.url).searchParams.getAll("did");
        if (values.length !== 1 || !values[0]) {
          throw new GovernanceServiceError(
            "invalid_request",
            400,
            "A single did:ckb identity is required.",
          );
        }
        return json({
          ok: true,
          version: GOVERNANCE_API_VERSION,
          evaluation: await service.evaluate(values[0]),
        });
      }
      case "challenge": {
        const rejected = method(request, "POST");
        if (rejected) return rejected;
        const parsed = governanceChallengeRequestSchema.safeParse(await body(request));
        if (!parsed.success) {
          throw new GovernanceServiceError(
            "invalid_request",
            400,
            "The vote challenge request is invalid.",
          );
        }
        return json({
          ok: true,
          version: GOVERNANCE_API_VERSION,
          challenge: await service.challenge(parsed.data),
        });
      }
      case "vote": {
        const rejected = method(request, "POST");
        if (rejected) return rejected;
        const parsed = governanceVoteRequestSchema.safeParse(await body(request));
        if (!parsed.success) {
          throw new GovernanceServiceError(
            "invalid_request",
            400,
            "The signed vote request is invalid.",
          );
        }
        return json({
          ok: true,
          version: GOVERNANCE_API_VERSION,
          ...(await service.vote(parsed.data)),
        });
      }
      case "receipt": {
        const rejected = method(request, "GET");
        if (rejected) return rejected;
        const values = new URL(request.url).searchParams.getAll("id");
        if (values.length !== 1 || !values[0]) {
          throw new GovernanceServiceError(
            "invalid_request",
            400,
            "A single receipt identifier is required.",
          );
        }
        return json(
          {
            ok: true,
            version: GOVERNANCE_API_VERSION,
            receipt: await service.receipt(values[0]),
          },
          200,
          { "cache-control": "public, s-maxage=60, stale-while-revalidate=300" },
        );
      }
    }
  } catch (error) {
    if (error instanceof GovernanceServiceError) {
      return errorResponse(error.status, error.code, error.message);
    }
    return errorResponse(503, "service_unavailable", "The governance service is unavailable.");
  }
}
