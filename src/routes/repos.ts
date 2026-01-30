import { Elysia, t } from "elysia";
import { createJob, updateJobStatus } from "../lib/supabase";
import { publishJob, pushJobToQueue } from "../lib/redis";
import { isValidModel, getDefaultModel } from "../lib/models";

// Validate GitHub/GitLab URL
function isValidRepoUrl(url: string): boolean {
  const patterns = [
    /^https:\/\/github\.com\/[\w-]+\/[\w.-]+(?:\.git)?$/,
    /^https:\/\/gitlab\.com\/[\w-]+\/[\w.-]+(?:\.git)?$/,
    /^https:\/\/bitbucket\.org\/[\w-]+\/[\w.-]+(?:\.git)?$/,
    /^git@github\.com:[\w-]+\/[\w.-]+\.git$/,
    /^git@gitlab\.com:[\w-]+\/[\w.-]+\.git$/,
  ];
  return patterns.some((pattern) => pattern.test(url));
}

// Extract repo name from URL
function extractRepoName(url: string): string {
  const match = url.match(/[\w-]+\/[\w.-]+(?:\.git)?$/);
  if (match) {
    return match[0].replace(".git", "");
  }
  return "unknown-repo";
}

export const reposRoutes = new Elysia({ prefix: "/repos" })
  // Submit a new repository for analysis
  .post(
    "/",
    async ({ body, set }) => {
      const { repo_url, model_id } = body;

      // Validate URL
      if (!isValidRepoUrl(repo_url)) {
        set.status = 400;
        return {
          success: false,
          error: "Invalid repository URL. Supported: GitHub, GitLab, Bitbucket",
        };
      }

      // Validate model
      const selectedModel = model_id && isValidModel(model_id) ? model_id : getDefaultModel().id;

      // Create job in Supabase
      const job = await createJob(repo_url, selectedModel);
      if (!job) {
        set.status = 500;
        return {
          success: false,
          error: "Failed to create job",
        };
      }

      // Update status to processing
      await updateJobStatus(job.id, "processing");

      // Publish to Redis queue
      try {
        await pushJobToQueue({
          job_id: job.id,
          repo_url: repo_url,
          selected_model: selectedModel,
          timestamp: new Date().toISOString(),
        });
      } catch (error) {
        console.error("Failed to publish to Redis:", error);
        await updateJobStatus(job.id, "failed", undefined, "Failed to queue job");
        set.status = 500;
        return {
          success: false,
          error: "Failed to queue job for processing",
        };
      }

      return {
        success: true,
        data: {
          job_id: job.id,
          repo_url: repo_url,
          repo_name: extractRepoName(repo_url),
          selected_model: selectedModel,
          status: "processing",
          message: "Repository queued for analysis",
        },
      };
    },
    {
      body: t.Object({
        repo_url: t.String({ minLength: 1 }),
        model_id: t.Optional(t.String()),
      }),
    }
  )

  // Retry a failed job
  .post(
    "/:jobId/retry",
    async ({ params, body, set }) => {
      const { jobId } = params;
      const { model_id } = body || {};

      // Import getJob dynamically to avoid circular dependency
      const { getJob } = await import("../lib/supabase");
      
      const job = await getJob(jobId);
      if (!job) {
        set.status = 404;
        return {
          success: false,
          error: "Job not found",
        };
      }

      if (job.status !== "failed") {
        set.status = 400;
        return {
          success: false,
          error: "Only failed jobs can be retried",
        };
      }

      // Use new model if provided, otherwise keep the original
      const selectedModel = model_id && isValidModel(model_id) ? model_id : job.selected_model;

      // Update job status
      await updateJobStatus(jobId, "processing");

      // Re-queue the job
      try {
        await pushJobToQueue({
          job_id: jobId,
          repo_url: job.repo_url,
          selected_model: selectedModel,
          timestamp: new Date().toISOString(),
        });
      } catch (error) {
        console.error("Failed to re-queue job:", error);
        await updateJobStatus(jobId, "failed", undefined, "Failed to re-queue job");
        set.status = 500;
        return {
          success: false,
          error: "Failed to re-queue job",
        };
      }

      return {
        success: true,
        data: {
          job_id: jobId,
          selected_model: selectedModel,
          status: "processing",
          message: "Job re-queued for processing",
        },
      };
    },
    {
      params: t.Object({
        jobId: t.String(),
      }),
      body: t.Optional(
        t.Object({
          model_id: t.Optional(t.String()),
        })
      ),
    }
  );
