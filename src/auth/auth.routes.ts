import { Router } from "express";
import { handleLogin } from "./auth.controller";

export const authRouter = Router();

authRouter.post("/login", handleLogin);
