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

export const signToken = (org: { id: string; orgId: string }) =>
  jwt.sign({ orgId: org.orgId }, env.JWT_SECRET, {
    algorithm: "HS256",
    subject: org.id,
    expiresIn: env.JWT_EXPIRES_IN,
  } as SignOptions);

export function verifyToken(token: string): { orgId: string; sub: string } {
  const p = jwt.verify(token, env.JWT_SECRET, {
    algorithms: ["HS256"],
  }) as jwt.JwtPayload;
  if (typeof p.orgId !== "string" || typeof p.sub !== "string")
    throw new Error("malformed token");
  return { orgId: p.orgId, sub: p.sub };
}

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
const session = (o: Parameters<typeof publicOrg>[0]) => ({
  token: signToken(o),
  tokenType: "Bearer",
  expiresIn: env.JWT_EXPIRES_IN,
  organization: publicOrg(o),
});

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
        if (e?.code !== "P2002") throw e; // unique clash (orgId collision or a racing duplicate email): retry
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
