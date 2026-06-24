import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { findUserByEmail } from "./auth.queries";

export class AuthServiceError extends Error {
  readonly cause?: unknown;

  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = "AuthServiceError";
    this.cause = cause;
  }
}

export class InvalidCredentialsError extends Error {
  constructor() {
    super("Invalid email or password");
    this.name = "InvalidCredentialsError";
  }
}

export class InactiveUserError extends Error {
  constructor() {
    super("Account is inactive");
    this.name = "InactiveUserError";
  }
}

const JWT_SECRET = process.env.JWT_SECRET!;
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN ?? "8h";

export async function loginUser(
  email: string,
  password: string,
): Promise<{ token: string; user: { id: string; email: string; roles: string[] } }> {
  try {
    const user = await findUserByEmail(email);

    // Always run bcrypt.compare regardless of whether the user exists to prevent
    // user enumeration via response-time differences.
    const hashToCompare = user?.password_hash ?? "$2b$10$invalidhashpaddingtomatch00000";
    const valid = await bcrypt.compare(password, hashToCompare);

    if (!user || !valid) {
      throw new InvalidCredentialsError();
    }

    if (!user.is_active) {
      throw new InactiveUserError();
    }

    const roles = user.user_roles.map((ur) => ur.roles.name);
    // @types/jsonwebtoken v9 uses ms.StringValue (branded type) for expiresIn.
    // At runtime any valid ms duration string works; cast through unknown.
    const token = jwt.sign(
      { sub: user.id, email: user.email, roles },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN } as unknown as Parameters<typeof jwt.sign>[2],
    );

    return { token, user: { id: user.id, email: user.email, roles } };
  } catch (err) {
    if (err instanceof InvalidCredentialsError || err instanceof InactiveUserError) {
      throw err;
    }
    throw new AuthServiceError("Login failed", err);
  }
}
