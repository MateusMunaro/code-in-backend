import { Elysia, t } from "elysia";
import { authPlugin } from "../lib/auth";
import {
  storeUserApiKey,
  listUserApiKeys,
  deleteUserApiKey,
  hasUserApiKey,
} from "../lib/crypto";

const VALID_PROVIDERS = ["google", "openai", "anthropic"] as const;

export const apiKeysRoutes = new Elysia({ prefix: "/api-keys" })
  .use(authPlugin)

  // ─────────────────────────────────────────────
  // GET /api-keys — List user's API keys (metadata only)
  // ─────────────────────────────────────────────
  .get("/", async ({ userId }) => {
    const keys = await listUserApiKeys(userId!);

    return {
      success: true,
      data: keys,
      count: keys.length,
    };
  })

  // ─────────────────────────────────────────────
  // POST /api-keys — Add/update an API key
  // ─────────────────────────────────────────────
  .post(
    "/",
    async ({ body, userId, set }) => {
      const { provider, api_key, label } = body;

      // Validate provider
      if (!VALID_PROVIDERS.includes(provider as (typeof VALID_PROVIDERS)[number])) {
        set.status = 400;
        return {
          success: false,
          error: `Invalid provider. Must be one of: ${VALID_PROVIDERS.join(", ")}`,
        };
      }

      // Validate key format (basic sanity check)
      if (!api_key || api_key.trim().length < 10) {
        set.status = 400;
        return {
          success: false,
          error: "API key is too short. Please provide a valid key.",
        };
      }

      const result = await storeUserApiKey({
        userId: userId!,
        provider,
        label: label || "Default",
        rawKey: api_key.trim(),
      });

      if ("error" in result) {
        set.status = 500;
        return {
          success: false,
          error: result.error,
        };
      }

      return {
        success: true,
        data: {
          id: result.id,
          provider,
          label: label || "Default",
          key_hint: result.keyHint,
          message: "API key stored securely",
        },
      };
    },
    {
      body: t.Object({
        provider: t.String(),
        api_key: t.String(),
        label: t.Optional(t.String()),
      }),
    }
  )

  // ─────────────────────────────────────────────
  // DELETE /api-keys/:keyId — Remove an API key
  // ─────────────────────────────────────────────
  .delete(
    "/:keyId",
    async ({ params, userId, set }) => {
      const { keyId } = params;
      const deleted = await deleteUserApiKey(userId!, keyId);

      if (!deleted) {
        set.status = 404;
        return {
          success: false,
          error: "API key not found or already deleted",
        };
      }

      return {
        success: true,
        data: {
          message: "API key deleted successfully",
        },
      };
    },
    {
      params: t.Object({
        keyId: t.String(),
      }),
    }
  )

  // ─────────────────────────────────────────────
  // GET /api-keys/status — Check which providers have keys configured
  // ─────────────────────────────────────────────
  .get("/status", async ({ userId }) => {
    const statuses = await Promise.all(
      VALID_PROVIDERS.map(async (provider) => ({
        provider,
        configured: await hasUserApiKey(userId!, provider),
      }))
    );

    return {
      success: true,
      data: statuses,
    };
  });
