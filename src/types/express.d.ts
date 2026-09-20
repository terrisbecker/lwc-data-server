export {};

declare module "express-serve-static-core" {
  interface Request {
    user?: {
      id: string;
      email: string;
      roles: string[];
    };
    /** Correlation id assigned by the requestId middleware; present on every request. */
    requestId: string;
  }
}
