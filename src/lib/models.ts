/**
 * Available LLM models configuration.
 * 
 * Models are primarily fetched from the `available_models` table in Supabase.
 * A hardcoded fallback list is kept for resilience (e.g. DB unreachable).
 */

import { supabaseAdmin } from "./supabase";

// TypeScript interface matching the DB schema
export interface LLMModel {
  id: string;
  name: string;
  provider: "google" | "openai" | "anthropic" | "ollama";
  description: string;
  maxTokens: number;
  costPer1kTokens: number | null;
  isLocal: boolean;
  capabilities: string[];
  isActive?: boolean;
  sortOrder?: number;
}

// ─────────────────────────────────────────────────────────────────
// Hardcoded fallback (used when DB is unreachable)
// ─────────────────────────────────────────────────────────────────
const FALLBACK_MODELS: LLMModel[] = [
  {
    id: "gemini-2.5-flash",
    name: "Gemini 2.5 Flash",
    provider: "google",
    description: "Modelo rápido e eficiente para análises ágeis",
    maxTokens: 1000000,
    costPer1kTokens: 0.00015,
    isLocal: false,
    capabilities: ["code-analysis", "documentation", "architecture"],
  },
  {
    id: "gemini-2.5-pro",
    name: "Gemini 2.5 Pro",
    provider: "google",
    description: "Modelo avançado com raciocínio profundo e contexto extenso",
    maxTokens: 1000000,
    costPer1kTokens: 0.00125,
    isLocal: false,
    capabilities: ["code-analysis", "documentation", "architecture", "patterns", "refactoring"],
  },
  {
    id: "gemini-2.0-flash",
    name: "Gemini 2.0 Flash",
    provider: "google",
    description: "Modelo multimodal rápido da geração anterior",
    maxTokens: 1000000,
    costPer1kTokens: 0.0001,
    isLocal: false,
    capabilities: ["code-analysis", "documentation", "architecture"],
  },
  {
    id: "gemini-3-flash",
    name: "Gemini 3 Flash",
    provider: "google",
    description: "Última geração, ultra-rápido com qualidade superior",
    maxTokens: 1000000,
    costPer1kTokens: 0.0002,
    isLocal: false,
    capabilities: ["code-analysis", "documentation", "architecture", "patterns"],
  },
  {
    id: "gemini-3-pro",
    name: "Gemini 3 Pro",
    provider: "google",
    description: "O mais poderoso — análise profunda de arquitetura e código",
    maxTokens: 2000000,
    costPer1kTokens: 0.002,
    isLocal: false,
    capabilities: ["code-analysis", "documentation", "architecture", "patterns", "refactoring"],
  },
];

// ─────────────────────────────────────────────────────────────────
// In-memory cache (refreshed periodically)
// ─────────────────────────────────────────────────────────────────
let cachedModels: LLMModel[] = [...FALLBACK_MODELS];
let lastCacheRefresh = 0;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Convert a DB row to the LLMModel interface.
 */
function dbRowToModel(row: Record<string, unknown>): LLMModel {
  return {
    id: row.model_id as string,
    name: row.name as string,
    provider: row.provider as LLMModel["provider"],
    description: (row.description as string) || "",
    maxTokens: (row.max_tokens as number) || 0,
    costPer1kTokens: (row.cost_per_1k_tokens as number) ?? null,
    isLocal: (row.is_local as boolean) || false,
    capabilities: (row.capabilities as string[]) || [],
    isActive: (row.is_active as boolean) ?? true,
    sortOrder: (row.sort_order as number) || 0,
  };
}

/**
 * Fetch models from the database, falling back to hardcoded list.
 */
async function refreshModelsCache(): Promise<void> {
  try {
    const { data, error } = await supabaseAdmin
      .from("available_models")
      .select("*")
      .eq("is_active", true)
      .order("sort_order", { ascending: true });

    if (error) {
      console.warn("⚠️ Failed to fetch models from DB, using fallback:", error.message);
      return;
    }

    if (data && data.length > 0) {
      cachedModels = data.map(dbRowToModel);
      lastCacheRefresh = Date.now();
      console.log(`✅ Refreshed models cache: ${cachedModels.length} models loaded`);
    }
  } catch (err) {
    console.warn("⚠️ Failed to refresh models cache, using fallback:", err);
  }
}

/**
 * Get all available models (from cache, refreshing if stale).
 */
export async function getAvailableModels(): Promise<LLMModel[]> {
  if (Date.now() - lastCacheRefresh > CACHE_TTL_MS) {
    await refreshModelsCache();
  }
  return cachedModels;
}

/**
 * Synchronous access to cached models (for backward compatibility).
 * Prefer getAvailableModels() when possible.
 */
export const AVAILABLE_MODELS: LLMModel[] = cachedModels;

// Get model by ID
export function getModelById(modelId: string): LLMModel | undefined {
  return cachedModels.find((m) => m.id === modelId);
}

// Get model by ID (async — ensures cache is fresh)
export async function getModelByIdAsync(modelId: string): Promise<LLMModel | undefined> {
  const models = await getAvailableModels();
  return models.find((m) => m.id === modelId);
}

// Get models by provider
export function getModelsByProvider(provider: LLMModel["provider"]): LLMModel[] {
  return cachedModels.filter((m) => m.provider === provider);
}

// Get local models only
export function getLocalModels(): LLMModel[] {
  return cachedModels.filter((m) => m.isLocal);
}

// Get cloud models only
export function getCloudModels(): LLMModel[] {
  return cachedModels.filter((m) => !m.isLocal);
}

// Validate if a model ID is valid
export function isValidModel(modelId: string): boolean {
  return cachedModels.some((m) => m.id === modelId);
}

// Get default model
export function getDefaultModel(): LLMModel {
  return cachedModels.find((m) => m.id === "gemini-2.5-flash") ?? cachedModels[0] ?? FALLBACK_MODELS[0]!;
}

// ─────────────────────────────────────────────────────────────────
// Admin functions (for managing models via API)
// ─────────────────────────────────────────────────────────────────

export async function addModel(model: Omit<LLMModel, "isActive" | "sortOrder"> & { sortOrder?: number }): Promise<boolean> {
  const { error } = await supabaseAdmin
    .from("available_models")
    .insert({
      model_id: model.id,
      name: model.name,
      provider: model.provider,
      description: model.description,
      max_tokens: model.maxTokens,
      cost_per_1k_tokens: model.costPer1kTokens,
      is_local: model.isLocal,
      capabilities: model.capabilities,
      sort_order: model.sortOrder || 0,
    });

  if (error) {
    console.error("Error adding model:", error);
    return false;
  }

  // Refresh cache
  await refreshModelsCache();
  return true;
}

export async function updateModel(modelId: string, updates: Partial<{
  name: string;
  description: string;
  maxTokens: number;
  costPer1kTokens: number | null;
  isActive: boolean;
  sortOrder: number;
  capabilities: string[];
}>): Promise<boolean> {
  const dbUpdates: Record<string, unknown> = {};
  if (updates.name !== undefined) dbUpdates.name = updates.name;
  if (updates.description !== undefined) dbUpdates.description = updates.description;
  if (updates.maxTokens !== undefined) dbUpdates.max_tokens = updates.maxTokens;
  if (updates.costPer1kTokens !== undefined) dbUpdates.cost_per_1k_tokens = updates.costPer1kTokens;
  if (updates.isActive !== undefined) dbUpdates.is_active = updates.isActive;
  if (updates.sortOrder !== undefined) dbUpdates.sort_order = updates.sortOrder;
  if (updates.capabilities !== undefined) dbUpdates.capabilities = updates.capabilities;

  const { error } = await supabaseAdmin
    .from("available_models")
    .update(dbUpdates)
    .eq("model_id", modelId);

  if (error) {
    console.error("Error updating model:", error);
    return false;
  }

  await refreshModelsCache();
  return true;
}

export async function deleteModel(modelId: string): Promise<boolean> {
  // Soft-delete by deactivating
  return updateModel(modelId, { isActive: false });
}

// Initialize cache on module load
refreshModelsCache().catch(() => {
  console.warn("⚠️ Initial models cache refresh failed — using fallback");
});
