export type AdminDifficulty =
  | "Easy"
  | "Medium"
  | "Medium-Hard"
  | "Hard"
  | "Expert";

export function getPosition(layerCount: number): number {
  if (layerCount <= 25) return 1;
  if (layerCount <= 45) return 2;
  if (layerCount <= 65) return 3;
  if (layerCount <= 90) return 4;
  return 5;
}

export function difficultyFromLayerCount(layerCount: number): AdminDifficulty {
  const position = getPosition(layerCount);
  if (position === 1) return "Easy";
  if (position === 2) return "Medium";
  if (position === 3) return "Medium-Hard";
  if (position === 4) return "Hard";
  return "Expert";
}

export function difficultyBadgeClass(d: AdminDifficulty): string {
  switch (d) {
    case "Easy":
      return "bg-emerald-500/25 text-emerald-100 ring-1 ring-emerald-400/40";
    case "Medium":
      return "bg-amber-500/25 text-amber-100 ring-1 ring-amber-400/40";
    case "Medium-Hard":
      return "bg-orange-500/25 text-orange-100 ring-1 ring-orange-400/40";
    case "Hard":
      return "bg-red-500/25 text-red-100 ring-1 ring-red-400/45";
    case "Expert":
      return "bg-fuchsia-500/25 text-fuchsia-100 ring-1 ring-fuchsia-400/45";
    default:
      return "bg-white/10 text-white/80";
  }
}
