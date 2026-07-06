import { Router } from "express";
import { requireRole } from "../middleware/require.role";
import {
  handleGeneratePresignedUrls,
  handleConfirmUploads,
  handleGetPresignedGetUrl,
  handleListUploads,
} from "./uploads.controller";

export const uploadsRouter = Router();

uploadsRouter.post("/presigned-urls", requireRole("volunteer"), handleGeneratePresignedUrls);
uploadsRouter.post("/confirm", requireRole("volunteer"), handleConfirmUploads);
uploadsRouter.get("/:id/url", requireRole("volunteer"), handleGetPresignedGetUrl);
uploadsRouter.get("/", requireRole("volunteer"), handleListUploads);
