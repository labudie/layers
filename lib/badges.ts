export const BADGE_DEFS = [
  {
    id: "first_play",
    name: "First Layer 🎨",
    description: "You played your first game!",
    icon: "🎨",
  },
  {
    id: "sharp_eye",
    name: "Sharp Eye 👁️",
    description: "Solved in just 1 guess!",
    icon: "👁️",
  },
  {
    id: "perfect_day",
    name: "Perfect Day ⭐",
    description: "Solved all 5 challenges!",
    icon: "⭐",
  },
  {
    id: "week_streak",
    name: "Week Streak 🔥",
    description: "7 days in a row!",
    icon: "🔥",
  },
  {
    id: "month_streak",
    name: "Month Streak 💎",
    description: "30 days in a row!",
    icon: "💎",
  },
  {
    id: "top_of_stack",
    name: "Top of the Stack 👑",
    description: "Ranked #1 on the daily leaderboard!",
    icon: "👑",
  },
  {
    id: "creator",
    name: "Creator 🎭",
    description: "Submitted your first design!",
    icon: "🎭",
  },
  {
    id: "popular_work",
    name: "Popular Work 🌟",
    description: "Your design was downloaded 10+ times!",
    icon: "🌟",
  },
  {
    id: "layer_up",
    name: "Layer Up 📚",
    description: "Completed all 5 daily challenges!",
    icon: "📚",
  },
  {
    id: "on_a_roll",
    name: "On a Roll 🎯",
    description: "3 day streak achieved!",
    icon: "🎯",
  },
  {
    id: "hot_streak",
    name: "Hot Streak 🌶️",
    description: "5 days in a row!",
    icon: "🌶️",
  },
  {
    id: "guessing_game",
    name: "Guessing Game 🎲",
    description: "Made 50 total guesses!",
    icon: "🎲",
  },
  {
    id: "century",
    name: "Century 💯",
    description: "100 total guesses made!",
    icon: "💯",
  },
  {
    id: "early_bird",
    name: "Early Bird 🌅",
    description: "Completed today's stack before noon!",
    icon: "🌅",
  },
] as const;

export type BadgeId = (typeof BADGE_DEFS)[number]["id"];

/** Stable order for stacking unlock modals after a daily complete. */
export const BADGE_UNLOCK_ORDER: readonly BadgeId[] = [
  "first_play",
  "sharp_eye",
  "layer_up",
  "early_bird",
  "perfect_day",
  "on_a_roll",
  "hot_streak",
  "week_streak",
  "month_streak",
  "guessing_game",
  "century",
  "top_of_stack",
  "creator",
  "popular_work",
];

export function badgeDefById(id: BadgeId) {
  return BADGE_DEFS.find((b) => b.id === id);
}
