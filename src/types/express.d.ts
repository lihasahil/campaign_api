export {};
declare global {
  namespace Express {
    interface Request {
      // Set by requireAuth from the verified JWT.
      auth?: { orgId: string; sub: string };
    }
  }
}
