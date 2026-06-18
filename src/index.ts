import "dotenv/config";
import express, { type Request, type Response } from "express";
import { pmnRouter } from "./pmn/pmn.routes";
import { errorHandler } from "./middleware/error.handler";

const app = express();
const port = Number(process.env.PORT) || 3000;

app.get("/health", (_req: Request, res: Response) => {
  res.json({ status: "ok", uptime: process.uptime(), timestamp: new Date().toISOString() });
});

app.use("/api/pmn", pmnRouter);

// Central error handler — must be registered after all routes.
app.use(errorHandler);

app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});
