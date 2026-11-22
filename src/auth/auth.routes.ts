import { Router } from "express";
import { validate } from "../openapi/validator";
import { handleLogin } from "./auth.controller";

export const authRouter = Router();

authRouter.post("/login", validate, handleLogin);
