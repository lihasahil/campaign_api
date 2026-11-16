import { randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import jwt, { type SignOptions } from "jsonwebtoken";
import { prisma } from "../../config/prisma";
import { env } from "../../config/env";
import { AppError, conflict } from "../../utils/errors";

const scrypt = promisify(scryptCb) as (
  pw: string,
  salt: Buffer,
  len: number,
) => Promise<Buffer>;

// Password format: scrypt$<saltHex>$<hashHex>. Anything else (e.g. the '!' of legacy placeholder orgs) never verifies.
export async function hashPassword(password: string) {
  const salt = randomBytes(16);
  return `scrypt$${salt.toString("hex")}$${(await scrypt(password, salt, 64)).toString("hex")}`;
}
export async function verifyPassword(password: string, stored: string) {
  const [alg, saltHex, hashHex] = stored.split("$");
  if (alg !== "scrypt" || !saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, "hex");
  const actual = await scrypt(
    password,
    Buffer.from(saltHex, "hex"),
    expected.length,
  );
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

type TokenType = "access" | "refresh";

const signToken = (
  org: { id: string; orgId: string },
  type: TokenType,
  expiresIn: string,
) =>
  jwt.sign({ orgId: org.orgId, tokenType: type }, env.JWT_SECRET, {
    algorithm: "HS256",
    subject: org.id,
    expiresIn,
  } as SignOptions);

export function verifyToken(
  token: string,
  expectedType: TokenType = "access",
): { orgId: string; sub: string } {
  const p = jwt.verify(token, env.JWT_SECRET, {
    algorithms: ["HS256"],
  }) as jwt.JwtPayload;
  if (
    typeof p.orgId !== "string" ||
    typeof p.sub !== "string" ||
    p.tokenType !== expectedType
  )
    throw new Error("malformed token");
  return { orgId: p.orgId, sub: p.sub };
}

const durationMs = (duration: string) => {
  const match = /^(\d+)([smhd])$/.exec(duration);
  if (!match) throw new Error(`Invalid token duration: ${duration}`);
  const units = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 };
  return Number(match[1]) * units[match[2] as keyof typeof units];
};

const publicOrg = (o: {
  id: string;
  orgId: string;
  name: string;
  email: string;
  createdAt: Date;
}) => ({
  id: o.id,
  orgId: o.orgId,
  name: o.name,
  email: o.email,
  createdAt: o.createdAt,
});
export const createTokens = (o: { id: string; orgId: string }) => ({
  accessToken: signToken(o, "access", env.ACCESS_TOKEN_EXPIRES_IN),
  refreshToken: signToken(o, "refresh", env.REFRESH_TOKEN_EXPIRES_IN),
});

const session = (o: Parameters<typeof publicOrg>[0]) => ({
  ...createTokens(o),
  accessTokenExpiresIn: env.ACCESS_TOKEN_EXPIRES_IN,
  refreshTokenExpiresIn: env.REFRESH_TOKEN_EXPIRES_IN,
  organization: publicOrg(o),
});

export const authCookieOptions = {
  access: {
    httpOnly: true,
    secure: env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: durationMs(env.ACCESS_TOKEN_EXPIRES_IN),
  },
  refresh: {
    httpOnly: true,
    secure: env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/api/auth/refresh",
    maxAge: durationMs(env.REFRESH_TOKEN_EXPIRES_IN),
  },
};

export const setAuthCookies = (
  res: { cookie: (name: string, value: string, options: object) => void },
  tokens: { accessToken: string; refreshToken: string },
) => {
  res.cookie("accessToken", tokens.accessToken, authCookieOptions.access);
  res.cookie("refreshToken", tokens.refreshToken, authCookieOptions.refresh);
};

export const authService = {
  async register(input: { name: string; email: string; password: string }) {
    const email = input.email.trim().toLowerCase();
    if (await prisma.organization.findUnique({ where: { email } }))
      throw conflict("An organization with this email already exists");
    const passwordHash = await hashPassword(input.password);
    for (let i = 0; i < 5; i++) {
      const orgId = `org_${randomBytes(6).toString("hex")}`; // unique public id, e.g. org_9f3a1c7be2d4
      try {
        return session(
          await prisma.organization.create({
            data: { orgId, name: input.name.trim(), email, passwordHash },
          }),
        );
      } catch (e: any) {
        if (e?.code !== "P2002") throw e;
      }
    }
    throw conflict(
      "Could not allocate a unique orgId or email already registered, try again",
    );
  },

  async login(input: { email: string; password: string }) {
    const org = await prisma.organization.findUnique({
      where: { email: input.email.trim().toLowerCase() },
    });
    const ok = org
      ? await verifyPassword(input.password, org.passwordHash)
      : false;
    if (!org || !ok)
      throw new AppError(401, "Invalid email or password", "UNAUTHORIZED");
    return session(org);
  },

  async me(orgId: string) {
    const org = await prisma.organization.findUnique({ where: { orgId } });
    if (!org)
      throw new AppError(401, "Organization no longer exists", "UNAUTHORIZED");
    return publicOrg(org);
  },
};
