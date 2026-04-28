import type { MapData } from "@world-forge/shared";

export function assertGeneratedMapMatchesStoredHash(mapData: MapData, storedMapHash: string): void {
  if (mapData.mapHash !== storedMapHash) {
    throw new Error(
      `Generated mapHash ${mapData.mapHash} does not match stored mapHash ${storedMapHash}. Rebuild the WASM artifact and reload the world.`,
    );
  }
}
