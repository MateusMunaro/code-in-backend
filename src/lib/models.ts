// Available LLM models configuration - Gemini only
export interface LLMModel {
  id: string;
  name: string;
  provider: "google";
  description: string;
  maxTokens: number;
  costPer1kTokens: number | null;
  isLocal: boolean;
  capabilities: string[];
}

export const AVAILABLE_MODELS: LLMModel[] = [
  // Google Gemini Models
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

// Get model by ID
export function getModelById(modelId: string): LLMModel | undefined {
  return AVAILABLE_MODELS.find((m) => m.id === modelId);
}

// Get models by provider
export function getModelsByProvider(provider: LLMModel["provider"]): LLMModel[] {
  return AVAILABLE_MODELS.filter((m) => m.provider === provider);
}

// Get local models only
export function getLocalModels(): LLMModel[] {
  return AVAILABLE_MODELS.filter((m) => m.isLocal);
}

// Get cloud models only
export function getCloudModels(): LLMModel[] {
  return AVAILABLE_MODELS.filter((m) => !m.isLocal);
}

// Validate if a model ID is valid
export function isValidModel(modelId: string): boolean {
  return AVAILABLE_MODELS.some((m) => m.id === modelId);
}

// Get default model
export function getDefaultModel(): LLMModel {
  return AVAILABLE_MODELS.find((m) => m.id === "gemini-2.5-flash")!;
}
