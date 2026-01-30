import { Elysia, t } from "elysia";
import {
  AVAILABLE_MODELS,
  getModelById,
  getModelsByProvider,
  getLocalModels,
  getCloudModels,
  getDefaultModel,
} from "../lib/models";

export const modelsRoutes = new Elysia({ prefix: "/models" })
  // Get all available models
  .get("/", async () => {
    return {
      success: true,
      data: AVAILABLE_MODELS,
      count: AVAILABLE_MODELS.length,
      default: getDefaultModel().id,
    };
  })

  // Get models grouped by provider
  .get("/grouped", async () => {
    const grouped = {
      openai: getModelsByProvider("openai"),
      anthropic: getModelsByProvider("anthropic"),
      google: getModelsByProvider("google"),
      ollama: getModelsByProvider("ollama"),
    };

    return {
      success: true,
      data: grouped,
      default: getDefaultModel().id,
    };
  })

  // Get only local models (Ollama)
  .get("/local", async () => {
    const models = getLocalModels();
    return {
      success: true,
      data: models,
      count: models.length,
    };
  })

  // Get only cloud models
  .get("/cloud", async () => {
    const models = getCloudModels();
    return {
      success: true,
      data: models,
      count: models.length,
    };
  })

  // Get a specific model by ID
  .get(
    "/:modelId",
    async ({ params, set }) => {
      const { modelId } = params;
      const model = getModelById(modelId);

      if (!model) {
        set.status = 404;
        return {
          success: false,
          error: "Model not found",
        };
      }

      return {
        success: true,
        data: model,
      };
    },
    {
      params: t.Object({
        modelId: t.String(),
      }),
    }
  )

  // Check if a model is available (for Ollama, checks if running)
  .get(
    "/:modelId/status",
    async ({ params, set }) => {
      const { modelId } = params;
      const model = getModelById(modelId);

      if (!model) {
        set.status = 404;
        return {
          success: false,
          error: "Model not found",
        };
      }

      // For cloud models, just check if API key is configured
      if (!model.isLocal) {
        let isConfigured = false;
        
        switch (model.provider) {
          case "openai":
            isConfigured = !!process.env.OPENAI_API_KEY;
            break;
          case "anthropic":
            isConfigured = !!process.env.ANTHROPIC_API_KEY;
            break;
          case "google":
            isConfigured = !!process.env.GOOGLE_API_KEY;
            break;
        }

        return {
          success: true,
          data: {
            model_id: modelId,
            available: isConfigured,
            message: isConfigured
              ? "API key configured"
              : `${model.provider.toUpperCase()}_API_KEY not configured`,
          },
        };
      }

      // For Ollama models, check if Ollama is running and model is available
      const ollamaUrl = process.env.OLLAMA_URL || "http://localhost:11434";
      
      try {
        const response = await fetch(`${ollamaUrl}/api/tags`);
        if (!response.ok) {
          return {
            success: true,
            data: {
              model_id: modelId,
              available: false,
              message: "Ollama is not running",
            },
          };
        }

        const data = await response.json() as { models: { name: string }[] };
        const installedModels = data.models?.map((m) => m.name) || [];
        const isInstalled = installedModels.some((m) => m.startsWith(modelId));

        return {
          success: true,
          data: {
            model_id: modelId,
            available: isInstalled,
            message: isInstalled
              ? "Model is installed and ready"
              : `Model not installed. Run: ollama pull ${modelId}`,
            installed_models: installedModels,
          },
        };
      } catch (error) {
        return {
          success: true,
          data: {
            model_id: modelId,
            available: false,
            message: "Cannot connect to Ollama. Is it running?",
          },
        };
      }
    },
    {
      params: t.Object({
        modelId: t.String(),
      }),
    }
  );
