import { Elysia, t } from "elysia";
import { getJob, getJobWithAnalysis, listJobs, updateJobStatus } from "../lib/supabase";
import { isValidModel } from "../lib/models";

export const jobsRoutes = new Elysia({ prefix: "/jobs" })
  // Get all jobs with pagination
  .get(
    "/",
    async ({ query }) => {
      const limit = query.limit ? parseInt(query.limit) : 50;
      const jobs = await listJobs(limit);

      return {
        success: true,
        data: jobs,
        count: jobs.length,
      };
    },
    {
      query: t.Object({
        limit: t.Optional(t.String()),
      }),
    }
  )

  // Get a specific job by ID
  .get(
    "/:jobId",
    async ({ params, set }) => {
      const { jobId } = params;
      const job = await getJob(jobId);

      if (!job) {
        set.status = 404;
        return {
          success: false,
          error: "Job not found",
        };
      }

      return {
        success: true,
        data: job,
      };
    },
    {
      params: t.Object({
        jobId: t.String(),
      }),
    }
  )

  // Get job with full analysis result
  .get(
    "/:jobId/analysis",
    async ({ params, set }) => {
      const { jobId } = params;
      const result = await getJobWithAnalysis(jobId);

      if (!result) {
        set.status = 404;
        return {
          success: false,
          error: "Job not found",
        };
      }

      return {
        success: true,
        data: result,
      };
    },
    {
      params: t.Object({
        jobId: t.String(),
      }),
    }
  )

  // Update job's selected model (only if pending or failed)
  .patch(
    "/:jobId/model",
    async ({ params, body, set }) => {
      const { jobId } = params;
      const { model_id } = body;

      // Validate model
      if (!isValidModel(model_id)) {
        set.status = 400;
        return {
          success: false,
          error: "Invalid model ID",
        };
      }

      const job = await getJob(jobId);
      if (!job) {
        set.status = 404;
        return {
          success: false,
          error: "Job not found",
        };
      }

      // Only allow model change if job is pending or failed
      if (job.status !== "pending" && job.status !== "failed") {
        set.status = 400;
        return {
          success: false,
          error: "Cannot change model for a job that is processing or completed",
        };
      }

      // Update the model in Supabase
      const { supabaseAdmin } = await import("../lib/supabase");
      const { error } = await supabaseAdmin
        .from("jobs")
        .update({ selected_model: model_id })
        .eq("id", jobId);

      if (error) {
        set.status = 500;
        return {
          success: false,
          error: "Failed to update model",
        };
      }

      return {
        success: true,
        data: {
          job_id: jobId,
          selected_model: model_id,
          message: "Model updated successfully",
        },
      };
    },
    {
      params: t.Object({
        jobId: t.String(),
      }),
      body: t.Object({
        model_id: t.String(),
      }),
    }
  )

  // Cancel a job (only if pending or processing)
  .delete(
    "/:jobId",
    async ({ params, set }) => {
      const { jobId } = params;
      const job = await getJob(jobId);

      if (!job) {
        set.status = 404;
        return {
          success: false,
          error: "Job not found",
        };
      }

      if (job.status === "completed") {
        set.status = 400;
        return {
          success: false,
          error: "Cannot cancel a completed job",
        };
      }

      // Mark as failed with cancellation message
      await updateJobStatus(jobId, "failed", undefined, "Job cancelled by user");

      return {
        success: true,
        data: {
          job_id: jobId,
          status: "failed",
          message: "Job cancelled successfully",
        },
      };
    },
    {
      params: t.Object({
        jobId: t.String(),
      }),
    }
  );
