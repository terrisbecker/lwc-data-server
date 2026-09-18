import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { findUserByEmail } from "./auth.queries";
import { ApiError, InternalError, UnauthorizedError, ForbiddenError } from "../http/api.error";
import { ErrorCodes } from "../http/error.codes";

// `message` stays the internal description for the log; the client sees the
// deliberately non-specific publicMessage instead.
export class AuthServiceError extends InternalError {
  constructor(message: string, cause?: unknown) {
    super(message, {
      code: ErrorCodes.AUTH_LOGIN_FAILED,
      publicMessage: "Sign-in could not be completed. Please try again.",
      cause,
    });
    this.name = "AuthServiceError";
  }
}

// Fired for both an unknown email and a bad password. The wording must stay
// identical in the two cases — together with the constant-time bcrypt compare in
// loginUser, that is what prevents user enumeration.
export class InvalidCredentialsError extends UnauthorizedError {
  constructor() {
    super("Invalid email or password", { code: ErrorCodes.INVALID_CREDENTIALS });
    this.name = "InvalidCredentialsError";
  }
}

export class InactiveUserError extends ForbiddenError {
  constructor() {
    super("Account is inactive", { code: ErrorCodes.ACCOUNT_INACTIVE });
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
    if (err instanceof ApiError) throw err;
    throw new AuthServiceError("Login failed", err);
  }
}
