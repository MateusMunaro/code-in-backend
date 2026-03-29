-- Migration 005: Available Models & User API Keys (encrypted)
-- ==========================================================
-- 
-- 1. Creates `available_models` table to manage LLM models from the DB.
-- 2. Creates `user_api_keys` table with AES-256 encryption via pgcrypto.
-- 3. Applies RLS policies for both tables.
-- 4. Seeds `available_models` with current Gemini models.
--
-- SECURITY MODEL for user_api_keys:
-- ─────────────────────────────────
-- API keys are encrypted at rest using pgp_sym_encrypt (AES-256) from
-- the pgcrypto extension. The encryption passphrase is stored in a
-- server-side environment variable (API_KEYS_ENCRYPTION_SECRET) and
-- NEVER exposed to the client.
--
-- Only the service_role (backend) can decrypt keys. Authenticated users
-- can see metadata (provider, label, masked key) but never the raw key.

-- =============================================
-- 0. Enable pgcrypto extension
-- =============================================
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- =============================================
-- 1. Available Models table
-- =============================================
CREATE TABLE IF NOT EXISTS public.available_models (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  model_id TEXT NOT NULL UNIQUE,           -- e.g. "gemini-2.5-flash"
  name TEXT NOT NULL,                       -- e.g. "Gemini 2.5 Flash"
  provider TEXT NOT NULL DEFAULT 'google',  -- google, openai, anthropic, ollama
  description TEXT,
  max_tokens INTEGER NOT NULL DEFAULT 0,
  cost_per_1k_tokens DOUBLE PRECISION,     -- null = free/unknown
  is_local BOOLEAN NOT NULL DEFAULT FALSE,
  capabilities TEXT[] DEFAULT '{}',         -- e.g. {"code-analysis","documentation"}
  is_active BOOLEAN NOT NULL DEFAULT TRUE,  -- soft-disable without deleting
  sort_order INTEGER NOT NULL DEFAULT 0,    -- for UI ordering
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT available_models_pkey PRIMARY KEY (id)
);

-- Index for lookups by model_id and provider
CREATE INDEX IF NOT EXISTS idx_available_models_model_id ON available_models(model_id);
CREATE INDEX IF NOT EXISTS idx_available_models_provider ON available_models(provider);
CREATE INDEX IF NOT EXISTS idx_available_models_active ON available_models(is_active);

-- Enable RLS
ALTER TABLE available_models ENABLE ROW LEVEL SECURITY;

-- Everyone can read active models (public catalog)
CREATE POLICY "Anyone can read active models"
  ON available_models FOR SELECT
  USING (is_active = TRUE OR auth.role() = 'service_role');

-- Only service_role can manage models
CREATE POLICY "Service role can insert models"
  ON available_models FOR INSERT
  WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "Service role can update models"
  ON available_models FOR UPDATE
  USING (auth.role() = 'service_role');

CREATE POLICY "Service role can delete models"
  ON available_models FOR DELETE
  USING (auth.role() = 'service_role');


-- =============================================
-- 2. User API Keys table (encrypted at rest)
-- =============================================
CREATE TABLE IF NOT EXISTS public.user_api_keys (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,                    -- google, openai, anthropic
  label TEXT NOT NULL DEFAULT 'Default',     -- user-friendly name
  encrypted_key BYTEA NOT NULL,              -- pgp_sym_encrypt(key, secret)
  key_hint TEXT NOT NULL,                    -- last 4 chars for display: "...xY9z"
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  last_used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  
  CONSTRAINT user_api_keys_pkey PRIMARY KEY (id),
  -- One active key per provider per user
  CONSTRAINT user_api_keys_unique_provider UNIQUE (user_id, provider)
);

-- Performance indexes
CREATE INDEX IF NOT EXISTS idx_user_api_keys_user_id ON user_api_keys(user_id);
CREATE INDEX IF NOT EXISTS idx_user_api_keys_provider ON user_api_keys(user_id, provider);

-- Enable RLS
ALTER TABLE user_api_keys ENABLE ROW LEVEL SECURITY;

-- Users can only see their own keys (metadata only — encrypted_key is opaque BYTEA)
CREATE POLICY "Users can select own api keys"
  ON user_api_keys FOR SELECT
  USING (
    user_id = auth.uid()
    OR auth.role() = 'service_role'
  );

CREATE POLICY "Users can insert own api keys"
  ON user_api_keys FOR INSERT
  WITH CHECK (
    user_id = auth.uid()
    OR auth.role() = 'service_role'
  );

CREATE POLICY "Users can update own api keys"
  ON user_api_keys FOR UPDATE
  USING (
    user_id = auth.uid()
    OR auth.role() = 'service_role'
  );

CREATE POLICY "Users can delete own api keys"
  ON user_api_keys FOR DELETE
  USING (
    user_id = auth.uid()
    OR auth.role() = 'service_role'
  );


-- =============================================
-- 3. Trigger to auto-update `updated_at`
-- =============================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_available_models_updated_at
  BEFORE UPDATE ON available_models
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER set_user_api_keys_updated_at
  BEFORE UPDATE ON user_api_keys
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();


-- =============================================
-- 4. Seed available_models with current catalog
-- =============================================
INSERT INTO available_models (model_id, name, provider, description, max_tokens, cost_per_1k_tokens, is_local, capabilities, sort_order)
VALUES
  ('gemini-2.5-flash', 'Gemini 2.5 Flash', 'google', 'Modelo rápido e eficiente para análises ágeis', 1000000, 0.00015, FALSE, ARRAY['code-analysis', 'documentation', 'architecture'], 1),
  ('gemini-2.5-pro', 'Gemini 2.5 Pro', 'google', 'Modelo avançado com raciocínio profundo e contexto extenso', 1000000, 0.00125, FALSE, ARRAY['code-analysis', 'documentation', 'architecture', 'patterns', 'refactoring'], 2),
  ('gemini-2.0-flash', 'Gemini 2.0 Flash', 'google', 'Modelo multimodal rápido da geração anterior', 1000000, 0.0001, FALSE, ARRAY['code-analysis', 'documentation', 'architecture'], 3),
  ('gemini-3-flash', 'Gemini 3 Flash', 'google', 'Última geração, ultra-rápido com qualidade superior', 1000000, 0.0002, FALSE, ARRAY['code-analysis', 'documentation', 'architecture', 'patterns'], 4),
  ('gemini-3-pro', 'Gemini 3 Pro', 'google', 'O mais poderoso — análise profunda de arquitetura e código', 2000000, 0.002, FALSE, ARRAY['code-analysis', 'documentation', 'architecture', 'patterns', 'refactoring'], 5)
ON CONFLICT (model_id) DO NOTHING;


-- =============================================
-- 5. Helper function to decrypt a key (service_role only)
-- =============================================
-- This function takes the encryption secret as a parameter.
-- The backend passes the secret from the env var at call time.
-- It is SECURITY DEFINER so only the function owner (postgres) runs it,
-- but we restrict execution to service_role via a check inside.

CREATE OR REPLACE FUNCTION decrypt_user_api_key(
  p_key_id UUID,
  p_encryption_secret TEXT
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_decrypted TEXT;
BEGIN
  -- Only service_role should call this
  IF current_setting('request.jwt.claim.role', true) IS DISTINCT FROM 'service_role'
     AND current_setting('role', true) IS DISTINCT FROM 'service_role'
  THEN
    RAISE EXCEPTION 'Access denied: only service_role can decrypt keys';
  END IF;

  SELECT pgp_sym_decrypt(encrypted_key, p_encryption_secret)
    INTO v_decrypted
    FROM user_api_keys
   WHERE id = p_key_id;

  IF v_decrypted IS NULL THEN
    RAISE EXCEPTION 'Key not found or decryption failed';
  END IF;

  RETURN v_decrypted;
END;
$$;


-- =============================================
-- 6. Helper function to store an encrypted key (service_role only)
-- =============================================
-- Encrypts and inserts in one atomic step. Returns the new row's UUID.

CREATE OR REPLACE FUNCTION store_encrypted_api_key(
  p_user_id UUID,
  p_provider TEXT,
  p_label TEXT,
  p_raw_key TEXT,
  p_key_hint TEXT,
  p_encryption_secret TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id UUID;
BEGIN
  -- Only service_role should call this
  IF current_setting('request.jwt.claim.role', true) IS DISTINCT FROM 'service_role'
     AND current_setting('role', true) IS DISTINCT FROM 'service_role'
  THEN
    RAISE EXCEPTION 'Access denied: only service_role can store keys';
  END IF;

  INSERT INTO user_api_keys (user_id, provider, label, encrypted_key, key_hint)
  VALUES (
    p_user_id,
    p_provider,
    p_label,
    pgp_sym_encrypt(p_raw_key, p_encryption_secret),
    p_key_hint
  )
  ON CONFLICT (user_id, provider)
  DO UPDATE SET
    label = EXCLUDED.label,
    encrypted_key = EXCLUDED.encrypted_key,
    key_hint = EXCLUDED.key_hint,
    is_active = TRUE,
    updated_at = now()
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;
