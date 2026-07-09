import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import type { FastifyRequest, FastifyReply } from "fastify";
import { DATA_DIR } from "./env.js";

const TOKEN_FILE = path.join(DATA_DIR, "token");

export function loadOrCreateToken(): string {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  if (fs.existsSync(TOKEN_FILE)) {
    return fs.readFileSync(TOKEN_FILE, "utf8").trim();
  }
  const token = crypto.randomBytes(24).toString("base64url");
  fs.writeFileSync(TOKEN_FILE, token, { mode: 0o600 });
  return token;
}

export function makeAuthHook(token: string) {
  return async (req: FastifyRequest, reply: FastifyReply) => {
    // WebSocket upgrades from browsers can't set headers; allow ?token= there.
    const header = req.headers.authorization;
    const bearer = header?.startsWith("Bearer ") ? header.slice(7) : undefined;
    const query = (req.query as Record<string, string | undefined>)?.token;
    const provided = bearer ?? query;
    if (
      !provided ||
      provided.length !== token.length ||
      !crypto.timingSafeEqual(Buffer.from(provided), Buffer.from(token))
    ) {
      reply.code(401).send({ error: "unauthorized" });
    }
  };
}
