import { Router } from "express";
import { handleGetCombinedFieldData } from "./pmn.controller";

/** Routes for PMN data, mounted under `/api/pmn` by the app. */
export const pmnRouter = Router();

pmnRouter.get("/combined-field-data", handleGetCombinedFieldData);
