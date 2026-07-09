import { WORLD_OPTIONS, type WorldSettings, type WorldOptionKey } from "@palserver/shared";

/**
 * Serialize structured settings into PalWorldSettings.ini.
 * Format: one OptionSettings=(Key=Value,...) tuple under the
 * [/Script/Pal.PalGameWorldSettings] section. Value formatting follows the
 * game's own DefaultPalWorldSettings.ini: floats get 6 decimals, enums are
 * emitted raw, free-form strings are double-quoted.
 */
export function renderPalWorldSettingsIni(settings: WorldSettings): string {
  const parts = (Object.keys(WORLD_OPTIONS) as WorldOptionKey[])
    .filter((key) => key in settings)
    .map((key) => {
      const meta = WORLD_OPTIONS[key];
      const value = settings[key];
      switch (meta.type) {
        case "bool":
          return `${key}=${value ? "True" : "False"}`;
        case "int":
          return `${key}=${Math.trunc(Number(value))}`;
        case "float":
          return `${key}=${Number(value).toFixed(6)}`;
        case "enum":
          return `${key}=${value}`;
        case "string":
          return `${key}=${JSON.stringify(String(value))}`;
      }
    });
  return [
    "[/Script/Pal.PalGameWorldSettings]",
    `OptionSettings=(${parts.join(",")})`,
    "",
  ].join("\n");
}
