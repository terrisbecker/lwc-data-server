import { Router } from "express";
import { requireRole } from "../middleware/require.role";
import {
  handleGetCombinedFieldData,
  handleCreateCombinedFieldData,
  handleUpdateCombinedFieldData,
  handleDeleteCombinedFieldData,
} from "./pmn.controller";

export const pmnRouter = Router();

pmnRouter.get("/combined-field-data", handleGetCombinedFieldData);
pmnRouter.post("/combined-field-data", requireRole("volunteer"), handleCreateCombinedFieldData);
pmnRouter.patch("/combined-field-data/:id", requireRole("admin"), handleUpdateCombinedFieldData);
pmnRouter.delete("/combined-field-data/:id", requireRole("admin"), handleDeleteCombinedFieldData);
