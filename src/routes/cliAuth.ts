import { Elysia, t } from "elysia";
import { getPublisher } from "../lib/redis";

const CLI_AUTH_PREFIX = "code-in:cli-auth:";
const CLI_AUTH_TTL_SECONDS = 300;

type CliAuthPayload = {
  access_token: string;
  refresh_token: string;
  expires_in: string;
  token_type: string;
};

type CliAuthSession = {
  status: "pending" | "completed";
  created_at: string;
  expires_at: number;
  payload?: CliAuthPayload;
};

const inMemorySessions = new Map<string, CliAuthSession>();

function getSessionKey(sessionId: string): string {
  return `${CLI_AUTH_PREFIX}${sessionId}`;
}

function isExpired(session: CliAuthSession): boolean {
  return session.expires_at <= Date.now();
}

async function saveSession(sessionId: string, session: CliAuthSession): Promise<void> {
  try {
    const publisher = getPublisher();
    await publisher.set(getSessionKey(sessionId), JSON.stringify(session), {
      EX: CLI_AUTH_TTL_SECONDS,
    });
    inMemorySessions.delete(getSessionKey(sessionId));
  } catch {
    inMemorySessions.set(getSessionKey(sessionId), session);
  }
}

async function readSession(sessionId: string): Promise<CliAuthSession | null> {
  const sessionKey = getSessionKey(sessionId);

  try {
    const publisher = getPublisher();
    const raw = await publisher.get(sessionKey);
    if (!raw) return null;

    const session = JSON.parse(raw) as CliAuthSession;
    if (isExpired(session)) {
      await deleteSession(sessionId);
      return null;
    }

    return session;
  } catch {
    const session = inMemorySessions.get(sessionKey) ?? null;
    if (!session) return null;
    if (isExpired(session)) {
      inMemorySessions.delete(sessionKey);
      return null;
    }
    return session;
  }
}

async function deleteSession(sessionId: string): Promise<void> {
  const sessionKey = getSessionKey(sessionId);

  try {
    const publisher = getPublisher();
    await publisher.del(sessionKey);
  } catch {
    // Fall back to in-memory cleanup only.
  }

  inMemorySessions.delete(sessionKey);
}

export const cliAuthRoutes = new Elysia({ prefix: "/auth/cli" })
  .post("/session", async () => {
    const sessionId = crypto.randomUUID().replace(/-/g, "");
    const session: CliAuthSession = {
      status: "pending",
      created_at: new Date().toISOString(),
      expires_at: Date.now() + CLI_AUTH_TTL_SECONDS * 1000,
    };

    await saveSession(sessionId, session);

    return {
      success: true,
      data: {
        session_id: sessionId,
        expires_in: CLI_AUTH_TTL_SECONDS,
      },
    };
  })
  .post(
    "/session/:sessionId/complete",
    async ({ params, body, set }) => {
      const session = await readSession(params.sessionId);
      if (!session) {
        set.status = 404;
        return {
          success: false,
          error: "Sessão de autenticação não encontrada ou expirada",
        };
      }

      const nextSession: CliAuthSession = {
        ...session,
        status: "completed",
        payload: {
          access_token: body.access_token,
          refresh_token: body.refresh_token,
          expires_in: body.expires_in,
          token_type: body.token_type,
        },
      };

      await saveSession(params.sessionId, nextSession);

      return {
        success: true,
        data: {
          status: "completed",
        },
      };
    },
    {
      params: t.Object({
        sessionId: t.String(),
      }),
      body: t.Object({
        access_token: t.String(),
        refresh_token: t.String(),
        expires_in: t.String(),
        token_type: t.String(),
      }),
    }
  )
  .get(
    "/session/:sessionId",
    async ({ params, set }) => {
      const session = await readSession(params.sessionId);
      if (!session) {
        set.status = 404;
        return {
          success: false,
          error: "Sessão de autenticação não encontrada ou expirada",
        };
      }

      if (session.status === "completed" && session.payload) {
        await deleteSession(params.sessionId);
        return {
          success: true,
          data: {
            status: "completed",
            ...session.payload,
          },
        };
      }

      return {
        success: true,
        data: {
          status: "pending",
        },
      };
    },
    {
      params: t.Object({
        sessionId: t.String(),
      }),
    }
  );