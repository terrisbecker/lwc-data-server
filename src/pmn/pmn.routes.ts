import { Router } from "express";
import { requireRole } from "../middleware/require.role";
import {
  handleGetCombinedFieldData,
  handleCreateCombinedFieldData,
  handleUpdateCombinedFieldData,
  handleDeleteCombinedFieldData,
  handleGetScumPhotoUrl,
} from "./pmn.controller";

export const pmnRouter = Router();

pmnRouter.get("/combined-field-data", handleGetCombinedFieldData);
pmnRouter.post("/combined-field-data", requireRole("volunteer"), handleCreateCombinedFieldData);
pmnRouter.patch("/combined-field-data/:id", requireRole("admin"), handleUpdateCombinedFieldData);
pmnRouter.delete("/combined-field-data/:id", requireRole("admin"), handleDeleteCombinedFieldData);
// Public: only uploads referenced in some record's scum_photos are served.
pmnRouter.get("/scum-photos/:uploadId/url", handleGetScumPhotoUrl);
