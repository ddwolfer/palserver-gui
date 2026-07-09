import { useEffect, useState } from "react";

/** Catalogs of Palworld entities, for labelling IDs and picking icons.
 * Served as static JSON from /game-data (see public/game-data/CREDITS.md). */
export interface GameEntity {
  id: string;
  name: string;
  /** icon filename within the category folder, if we have artwork for it */
  icon?: string;
}

export interface GameData {
  pals: GameEntity[];
  items: GameEntity[];
  palById: Map<string, GameEntity>;
  itemById: Map<string, GameEntity>;
}

let cache: GameData | null = null;
let inflight: Promise<GameData> | null = null;

async function load(): Promise<GameData> {
  if (cache) return cache;
  if (!inflight) {
    inflight = (async () => {
      const [pals, items] = await Promise.all([
        fetch("/game-data/pals.json").then((r) => r.json() as Promise<GameEntity[]>),
        fetch("/game-data/items.json").then((r) => r.json() as Promise<GameEntity[]>),
      ]);
      cache = {
        pals,
        items,
        palById: new Map(pals.map((p) => [p.id, p])),
        itemById: new Map(items.map((i) => [i.id, i])),
      };
      return cache;
    })();
  }
  return inflight;
}

export function useGameData(): GameData | null {
  const [data, setData] = useState<GameData | null>(cache);
  useEffect(() => {
    if (!cache) void load().then(setData).catch(() => setData(null));
  }, []);
  return data;
}

export const palIconUrl = (icon: string) => `/game-data/pals/${icon}`;
export const itemIconUrl = (icon: string) => `/game-data/items/${icon}`;
