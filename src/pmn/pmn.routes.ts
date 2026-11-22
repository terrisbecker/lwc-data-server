import { Router } from "express";
import { validate } from "../openapi/validator";
import { requireRole } from "../middleware/require.role";
import {
  handleGetCombinedFieldData,
  handleCreateCombinedFieldData,
  handleUpdateCombinedFieldData,
  handleDeleteCombinedFieldData,
  handleGetScumPhotoUrl,
} from "./pmn.controller";

export const pmnRouter = Router();

pmnRouter.get("/combined-field-data", validate, handleGetCombinedFieldData);
pmnRouter.post("/combined-field-data", requireRole("volunteer"), validate, handleCreateCombinedFieldData);
pmnRouter.patch("/combined-field-data/:id", requireRole("admin"), validate, handleUpdateCombinedFieldData);
pmnRouter.delete("/combined-field-data/:id", requireRole("admin"), validate, handleDeleteCombinedFieldData);
// Public: only uploads referenced in some record's scum_photos are served.
pmnRouter.get("/scum-photos/:uploadId/url", validate, handleGetScumPhotoUrl);
