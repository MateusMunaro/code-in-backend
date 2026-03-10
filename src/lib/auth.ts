import { Elysia } from "elysia";
import { supabase } from "./supabase";

/**
 * Elysia auth plugin.
 *
 * Extracts and validates the `Authorization: Bearer <token>` header using
 * Supabase's `auth.getUser()`. Injects `userId` (string) into the request
 * context for every handler that uses this plugin.
 *
 * If the token is missing or invalid the request is short-circuited with
 * HTTP 401 before the route handler runs.
 *
 * Public routes (`GET /health`, `GET /models/*`) should be registered
 * WITHOUT this plugin — keep them on their own Elysia instance.
 */
export const authPlugin = new Elysia({ name: "auth" })
  // 1. Derive userId from Bearer token — `as: "scoped"` propagates the derived
  //    type (and hook) into every route group that calls `.use(authPlugin)`.
  .derive({ as: "scoped" }, async ({ request, set }) => {
    const authorization = request.headers.get("authorization");

    if (!authorization?.startsWith("Bearer ")) {
      set.status = 401;
      return { userId: null as string | null };
    }

    const token = authorization.slice(7);

    const {
      data: { user },
      error,
    } = await supabase.auth.getUser(token);

    if (error || !user) {
      set.status = 401;
      return { userId: null as string | null };
    }

    return { userId: user.id as string | null };
  })

  // 2. Guard: reject the request early if userId was not resolved
  .onBeforeHandle({ as: "scoped" }, ({ userId }) => {
    if (userId === null) {
      return { success: false, error: "Unauthorized" };
    }
  });
