/**
 * Crypto utilities for user API key management.
 *
 * Keys are encrypted/decrypted using pgcrypto's pgp_sym_encrypt/decrypt
 * (AES-256) directly in Supabase. The encryption secret lives in the
 * API_KEYS_ENCRYPTION_SECRET env var and is NEVER sent to the client.
 *
 * Flow:
 *  1. User submits raw API key → backend encrypts via pgp_sym_encrypt → stores BYTEA
 *  2. Backend needs key → calls decrypt_user_api_key RPC → gets plain text
 *  3. Client only ever sees key_hint ("...xY9z") — never the encrypted blob
 */

import { supabaseAdmin } from "./supabase";

const ENCRYPTION_SECRET = process.env.API_KEYS_ENCRYPTION_SECRET;

if (!ENCRYPTION_SECRET) {
  console.warn(
    "⚠️  API_KEYS_ENCRYPTION_SECRET is not set. User API key features will not work."
  );
}

/**
 * Generate a hint from the raw key (last 4 chars)
 */
export function generateKeyHint(rawKey: string): string {
  if (rawKey.length <= 4) return "****";
  return `...${rawKey.slice(-4)}`;
}

/**
 * Store an encrypted API key for a user.
 * Uses Supabase's pgp_sym_encrypt via a raw SQL insert (service_role needed).
 */
export async function storeUserApiKey(params: {
  userId: string;
  provider: string;
  label: string;
  rawKey: string;
}): Promise<{ id: string; keyHint: string } | { error: string }> {
  const { userId, provider, label, rawKey } = params;

  if (!ENCRYPTION_SECRET) {
    return { error: "Encryption secret not configured on server" };
  }

  // Validate raw key is not empty
  if (!rawKey || rawKey.trim().length === 0) {
    return { error: "API key cannot be empty" };
  }

  const keyHint = generateKeyHint(rawKey);

  // Use RPC to insert with encryption (avoids raw SQL, uses pgp_sym_encrypt)
  // We'll use supabaseAdmin.rpc with a custom function, or insert directly
  // with the encrypted_key computed in the app.
  //
  // Strategy: We do the insert via the Supabase client but call
  // pgp_sym_encrypt via an RPC wrapper.
  const { data, error } = await supabaseAdmin.rpc("store_encrypted_api_key", {
    p_user_id: userId,
    p_provider: provider,
    p_label: label,
    p_raw_key: rawKey,
    p_key_hint: keyHint,
    p_encryption_secret: ENCRYPTION_SECRET,
  });

  if (error) {
    console.error("Error storing API key:", error);
    return { error: error.message };
  }

  return { id: data as string, keyHint };
}

/**
 * Decrypt and retrieve a user's API key for a specific provider.
 * This should ONLY be called server-side when the key is needed for an API call.
 */
export async function decryptUserApiKey(
  userId: string,
  provider: string
): Promise<string | null> {
  if (!ENCRYPTION_SECRET) {
    console.error("Encryption secret not configured");
    return null;
  }

  // First, find the key ID for this user+provider
  const { data: keyRecord, error: findError } = await supabaseAdmin
    .from("user_api_keys")
    .select("id")
    .eq("user_id", userId)
    .eq("provider", provider)
    .eq("is_active", true)
    .single();

  if (findError || !keyRecord) {
    return null;
  }

  // Decrypt via the secure RPC function
  const { data, error } = await supabaseAdmin.rpc("decrypt_user_api_key", {
    p_key_id: keyRecord.id,
    p_encryption_secret: ENCRYPTION_SECRET,
  });

  if (error) {
    console.error("Error decrypting API key:", error);
    return null;
  }

  // Update last_used_at
  await supabaseAdmin
    .from("user_api_keys")
    .update({ last_used_at: new Date().toISOString() })
    .eq("id", keyRecord.id);

  return data as string;
}

/**
 * List a user's API keys (metadata only — no raw keys returned).
 */
export async function listUserApiKeys(userId: string) {
  const { data, error } = await supabaseAdmin
    .from("user_api_keys")
    .select("id, provider, label, key_hint, is_active, last_used_at, created_at, updated_at")
    .eq("user_id", userId)
    .order("provider");

  if (error) {
    console.error("Error listing API keys:", error);
    return [];
  }

  return data || [];
}

/**
 * Delete a user's API key.
 */
export async function deleteUserApiKey(
  userId: string,
  keyId: string
): Promise<boolean> {
  const { error } = await supabaseAdmin
    .from("user_api_keys")
    .delete()
    .eq("id", keyId)
    .eq("user_id", userId); // Enforce ownership

  if (error) {
    console.error("Error deleting API key:", error);
    return false;
  }

  return true;
}

/**
 * Check if a user has an active key for a given provider.
 */
export async function hasUserApiKey(
  userId: string,
  provider: string
): Promise<boolean> {
  const { data } = await supabaseAdmin
    .from("user_api_keys")
    .select("id")
    .eq("user_id", userId)
    .eq("provider", provider)
    .eq("is_active", true)
    .single();

  return !!data;
}
