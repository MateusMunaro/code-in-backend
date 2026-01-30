// Available LLM models configuration
export interface LLMModel {
  id: string;
  name: string;
  provider: "openai" | "anthropic" | "ollama" | "google";
  description: string;
  maxTokens: number;
  costPer1kTokens: number | null; // null for local models
  isLocal: boolean;
  capabilities: string[];
}

export const AVAILABLE_MODELS: LLMModel[] = [
  // OpenAI Models
  {
    id: "gpt-4o",
    name: "GPT-4o",
    provider: "openai",
    description: "Most capable OpenAI model, excellent for code analysis",
    maxTokens: 128000,
    costPer1kTokens: 0.005,
    isLocal: false,
    capabilities: ["code-analysis", "documentation", "architecture", "patterns"],
  },
  {
    id: "gpt-4o-mini",
    name: "GPT-4o Mini",
    provider: "openai",
    description: "Fast and cost-effective, good for simpler analysis",
    maxTokens: 128000,
    costPer1kTokens: 0.00015,
    isLocal: false,
    capabilities: ["code-analysis", "documentation"],
  },
  {
    id: "gpt-4-turbo",
    name: "GPT-4 Turbo",
    provider: "openai",
    description: "Powerful reasoning with vision capabilities",
    maxTokens: 128000,
    costPer1kTokens: 0.01,
    isLocal: false,
    capabilities: ["code-analysis", "documentation", "architecture", "patterns"],
  },

  // Anthropic Models
  {
    id: "claude-3-5-sonnet-20241022",
    name: "Claude 3.5 Sonnet",
    provider: "anthropic",
    description: "Best for code understanding and documentation",
    maxTokens: 200000,
    costPer1kTokens: 0.003,
    isLocal: false,
    capabilities: ["code-analysis", "documentation", "architecture", "patterns", "refactoring"],
  },
  {
    id: "claude-3-opus-20240229",
    name: "Claude 3 Opus",
    provider: "anthropic",
    description: "Most powerful Claude model for complex analysis",
    maxTokens: 200000,
    costPer1kTokens: 0.015,
    isLocal: false,
    capabilities: ["code-analysis", "documentation", "architecture", "patterns", "refactoring"],
  },
  {
    id: "claude-3-haiku-20240307",
    name: "Claude 3 Haiku",
    provider: "anthropic",
    description: "Fastest Claude model, good for quick analysis",
    maxTokens: 200000,
    costPer1kTokens: 0.00025,
    isLocal: false,
    capabilities: ["code-analysis", "documentation"],
  },

  // Google Models
  {
    id: "gemini-2.0-flash",
    name: "Gemini 2.0 Flash",
    provider: "google",
    description: "Google's fast multimodal model",
    maxTokens: 1000000,
    costPer1kTokens: 0.0001,
    isLocal: false,
    capabilities: ["code-analysis", "documentation", "architecture"],
  },
  {
    id: "gemini-1.5-pro",
    name: "Gemini 1.5 Pro",
    provider: "google",
    description: "Google's flagship model with 1M context",
    maxTokens: 1000000,
    costPer1kTokens: 0.00125,
    isLocal: false,
    capabilities: ["code-analysis", "documentation", "architecture", "patterns"],
  },

  // Ollama Local Models
  {
    id: "llama3.2",
    name: "Llama 3.2",
    provider: "ollama",
    description: "Meta's latest open model, runs locally",
    maxTokens: 128000,
    costPer1kTokens: null,
    isLocal: true,
    capabilities: ["code-analysis", "documentation"],
  },
  {
    id: "codellama",
    name: "Code Llama",
    provider: "ollama",
    description: "Specialized for code, runs locally",
    maxTokens: 16000,
    costPer1kTokens: null,
    isLocal: true,
    capabilities: ["code-analysis", "documentation", "refactoring"],
  },
  {
    id: "deepseek-coder-v2",
    name: "DeepSeek Coder V2",
    provider: "ollama",
    description: "Excellent code model, runs locally",
    maxTokens: 128000,
    costPer1kTokens: null,
    isLocal: true,
    capabilities: ["code-analysis", "documentation", "architecture", "patterns"],
  },
  {
    id: "qwen2.5-coder",
    name: "Qwen 2.5 Coder",
    provider: "ollama",
    description: "Alibaba's code-specialized model",
    maxTokens: 32000,
    costPer1kTokens: null,
    isLocal: true,
    capabilities: ["code-analysis", "documentation", "refactoring"],
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
  return AVAILABLE_MODELS.find((m) => m.id === "gpt-4o-mini")!;
}
