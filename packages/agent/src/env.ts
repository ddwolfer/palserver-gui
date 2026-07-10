import path from "node:path";
import os from "node:os";

export const AGENT_VERSION = "2.0.0-alpha.0";

export const DATA_DIR = process.env.PALSERVER_DATA_DIR
  ? path.resolve(process.env.PALSERVER_DATA_DIR)
  : path.join(os.homedir(), ".palserver-agent");

export const PORT = Number(process.env.PALSERVER_AGENT_PORT ?? 8250);
export const HOST = process.env.PALSERVER_AGENT_HOST ?? "0.0.0.0";

/** 預設連本機(loopback)免 token;多使用者主機設 =1 強制一律要 token。 */
export const REQUIRE_TOKEN = process.env.PALSERVER_REQUIRE_TOKEN === "1";

/** Docker images used for each flavor; override to pin versions or use a registry. */
export const IMAGES: Record<"vanilla" | "modded", string> = {
  vanilla: process.env.PALSERVER_IMAGE_VANILLA ?? "palserver/vanilla:latest",
  modded: process.env.PALSERVER_IMAGE_MODDED ?? "palserver/modded:latest",
};

export const CONTAINER_PREFIX = "palserver-";
export const INSTANCE_LABEL = "app.palserver.instance";
