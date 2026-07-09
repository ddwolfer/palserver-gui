import type { FastifyInstance } from "fastify";
import {
  CreateInstanceSchema,
  UpdateSettingsSchema,
  WorldSettingsSchema,
  type AgentInfo,
  type InstanceDetail,
  type InstanceSummary,
} from "@palserver/shared";
import { AGENT_VERSION } from "./env.js";
import type { InstanceStore, InstanceRecord } from "./store.js";
import * as dockerOps from "./docker.js";

async function toSummary(rec: InstanceRecord): Promise<InstanceSummary> {
  const { status } = await dockerOps.getStatus(rec);
  return {
    id: rec.id,
    name: rec.name,
    flavor: rec.flavor,
    gamePort: rec.gamePort,
    status,
    createdAt: rec.createdAt,
  };
}

export function registerRoutes(app: FastifyInstance, store: InstanceStore): void {
  const getOr404 = (id: string): InstanceRecord => {
    const rec = store.get(id);
    if (!rec) {
      const err = new Error("instance not found") as Error & { statusCode: number };
      err.statusCode = 404;
      throw err;
    }
    return rec;
  };

  app.get("/api/info", async (): Promise<AgentInfo> => {
    const version = await dockerOps.docker.version();
    return {
      name: "palserver-agent",
      version: AGENT_VERSION,
      dockerVersion: version.Version,
      instanceCount: store.list().length,
    };
  });

  app.get("/api/instances", async (): Promise<InstanceSummary[]> => {
    return Promise.all(store.list().map(toSummary));
  });

  app.post("/api/instances", async (req, reply) => {
    const input = CreateInstanceSchema.parse(req.body);
    if (store.findByName(input.name)) {
      return reply.code(409).send({ error: `instance "${input.name}" already exists` });
    }
    const portTaken = store.list().some((r) => r.gamePort === input.gamePort);
    if (portTaken) {
      return reply.code(409).send({ error: `game port ${input.gamePort} already in use` });
    }
    const settings = WorldSettingsSchema.parse({
      ServerName: input.name,
      PublicPort: input.gamePort,
      ...input.settings,
    });
    const rec = store.create({
      name: input.name,
      flavor: input.flavor,
      gamePort: input.gamePort,
      settings,
    });
    dockerOps.writeConfig(store.instanceDir(rec.id), settings);
    reply.code(201);
    return toSummary(rec);
  });

  app.get("/api/instances/:id", async (req): Promise<InstanceDetail> => {
    const rec = getOr404((req.params as { id: string }).id);
    const { status, containerId } = await dockerOps.getStatus(rec);
    return { ...(await toSummary(rec)), status, containerId, settings: rec.settings };
  });

  app.put("/api/instances/:id/settings", async (req) => {
    const rec = getOr404((req.params as { id: string }).id);
    const patch = UpdateSettingsSchema.parse(req.body);
    const updated = store.update(rec.id, {
      settings: WorldSettingsSchema.parse({ ...rec.settings, ...patch }),
    });
    dockerOps.writeConfig(store.instanceDir(rec.id), updated.settings);
    return { applied: "on-next-restart", settings: updated.settings };
  });

  app.post("/api/instances/:id/start", async (req) => {
    const rec = getOr404((req.params as { id: string }).id);
    await dockerOps.startInstance(rec, store.instanceDir(rec.id));
    return toSummary(rec);
  });

  app.post("/api/instances/:id/stop", async (req) => {
    const rec = getOr404((req.params as { id: string }).id);
    await dockerOps.stopInstance(rec);
    return toSummary(rec);
  });

  app.post("/api/instances/:id/restart", async (req) => {
    const rec = getOr404((req.params as { id: string }).id);
    await dockerOps.restartInstance(rec, store.instanceDir(rec.id));
    return toSummary(rec);
  });

  app.delete("/api/instances/:id", async (req, reply) => {
    const rec = getOr404((req.params as { id: string }).id);
    await dockerOps.removeInstanceContainer(rec);
    store.remove(rec.id);
    // Save data under instanceDir is kept on disk deliberately; deleting
    // world saves should be an explicit, separate action.
    reply.code(204);
  });

  app.get("/api/instances/:id/stats", async (req, reply) => {
    const rec = getOr404((req.params as { id: string }).id);
    const stats = await dockerOps.getStats(rec);
    if (!stats) return reply.code(409).send({ error: "container not running" });
    return stats;
  });

  app.get("/api/instances/:id/logs", { websocket: true }, (socket, req) => {
    const rec = store.get((req.params as { id: string }).id);
    if (!rec) {
      socket.close(4004, "instance not found");
      return;
    }
    let cleanup: (() => void) | null = null;
    dockerOps
      .streamLogs(
        rec,
        (line) => socket.send(line),
        () => socket.close(1000, "log stream ended"),
      )
      .then((stop) => {
        cleanup = stop;
        if (socket.readyState !== socket.OPEN) stop();
      })
      .catch((err: Error) => socket.close(1011, err.message.slice(0, 120)));
    socket.on("close", () => cleanup?.());
  });
}
