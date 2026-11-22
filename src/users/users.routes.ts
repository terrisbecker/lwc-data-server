import { Router } from "express";
import { validate } from "../openapi/validator";
import { requireRole } from "../middleware/require.role";
import {
  handleGetUsers,
  handleCreateUser,
  handleUpdateUser,
  handleDeleteUser,
} from "./users.controller";

export const usersRouter = Router();

usersRouter.get("/", requireRole("admin"), validate, handleGetUsers);
usersRouter.post("/", requireRole("admin"), validate, handleCreateUser);
usersRouter.patch("/:id", requireRole("admin"), validate, handleUpdateUser);
usersRouter.delete("/:id", requireRole("admin"), validate, handleDeleteUser);
