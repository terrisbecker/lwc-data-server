import { Router } from "express";
import { requireRole } from "../middleware/require.role";
import {
  handleGetPhosphateData,
  handleCreatePhosphateData,
  handleUpdatePhosphateData,
  handleDeletePhosphateData,
} from "./watershed.controller";

export const watershedRouter = Router();

watershedRouter.get("/", handleGetPhosphateData);
watershedRouter.post("/", requireRole("volunteer"), handleCreatePhosphateData);
watershedRouter.patch("/:id", requireRole("admin"), handleUpdatePhosphateData);
watershedRouter.delete("/:id", requireRole("admin"), handleDeletePhosphateData);
