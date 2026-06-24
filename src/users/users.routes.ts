import { Router } from "express";
import { requireRole } from "../middleware/require.role";
import {
  handleGetUsers,
  handleCreateUser,
  handleUpdateUser,
  handleDeleteUser,
} from "./users.controller";

export const usersRouter = Router();

usersRouter.get("/", requireRole("admin"), handleGetUsers);
usersRouter.post("/", requireRole("admin"), handleCreateUser);
usersRouter.patch("/:id", requireRole("admin"), handleUpdateUser);
usersRouter.delete("/:id", requireRole("admin"), handleDeleteUser);
