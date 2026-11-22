import { Router } from "express";
import { validate } from "../openapi/validator";
import { requireRole } from "../middleware/require.role";
import {
  handleGetPhosphateData,
  handleCreatePhosphateData,
  handleUpdatePhosphateData,
  handleDeletePhosphateData,
} from "./watershed.controller";

export const watershedRouter = Router();

watershedRouter.get("/", validate, handleGetPhosphateData);
watershedRouter.post("/", requireRole("volunteer"), validate, handleCreatePhosphateData);
watershedRouter.patch("/:id", requireRole("admin"), validate, handleUpdatePhosphateData);
watershedRouter.delete("/:id", requireRole("admin"), validate, handleDeletePhosphateData);
