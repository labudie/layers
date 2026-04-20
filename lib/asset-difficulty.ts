export type AdminDifficulty = "Easy" | "Medium" | "Hard";

export function difficultyFromLayerCount(layerCount: number): AdminDifficulty {
  if (layerCount <= 15) return "Easy";
  if (layerCount <= 40) return "Medium";
  return "Hard";
}

export function difficultyBadgeClass(d: AdminDifficulty): string {
  switch (d) {
    case "Easy":
      return "bg-emerald-500/25 text-emerald-100 ring-1 ring-emerald-400/40";
    case "Medium":
      return "bg-amber-500/25 text-amber-100 ring-1 ring-amber-400/40";
    case "Hard":
      return "bg-red-500/25 text-red-100 ring-1 ring-red-400/45";
    default:
      return "bg-white/10 text-white/80";
  }
}
