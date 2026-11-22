import { Router } from "express";
import { validate } from "../openapi/validator";
import { requireRole } from "../middleware/require.role";
import {
  handleGeneratePresignedUrls,
  handleConfirmUploads,
  handleGetPresignedGetUrl,
  handleListUploads,
} from "./uploads.controller";

export const uploadsRouter = Router();

uploadsRouter.post("/presigned-urls", requireRole("volunteer"), validate, handleGeneratePresignedUrls);
uploadsRouter.post("/confirm", requireRole("volunteer"), validate, handleConfirmUploads);
uploadsRouter.get("/:id/url", requireRole("volunteer"), validate, handleGetPresignedGetUrl);
uploadsRouter.get("/", requireRole("volunteer"), validate, handleListUploads);
