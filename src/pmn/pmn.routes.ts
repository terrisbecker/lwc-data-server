import { Router } from "express";
import {
  handleGetCombinedFieldData,
  handleCreateCombinedFieldData,
  handleUpdateCombinedFieldData,
  handleDeleteCombinedFieldData,
} from "./pmn.controller";

/** Routes for PMN data, mounted under `/api/pmn` by the app. */
export const pmnRouter = Router();

pmnRouter.get("/combined-field-data", handleGetCombinedFieldData);
pmnRouter.post("/combined-field-data", handleCreateCombinedFieldData);
pmnRouter.patch("/combined-field-data/:id", handleUpdateCombinedFieldData);
pmnRouter.delete("/combined-field-data/:id", handleDeleteCombinedFieldData);
