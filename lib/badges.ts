export const BADGE_DEFS = [
  { id: "first_play", name: "First Play", description: "Played your first game", icon: "🎮" },
  { id: "sharp_eye", name: "Sharp Eye", description: "Solved in 1 guess", icon: "👁️" },
  { id: "perfect_day", name: "Perfect Day", description: "Solved all 5 in a day", icon: "💯" },
  { id: "week_streak", name: "Week Streak", description: "7 day streak", icon: "🔥" },
  { id: "month_streak", name: "Month Streak", description: "30 day streak", icon: "🗓️" },
  { id: "top_of_stack", name: "Top of the Stack", description: "#1 on daily leaderboard", icon: "🏆" },
  { id: "creator", name: "Creator", description: "Submitted your first design", icon: "🎨" },
  { id: "popular_work", name: "Popular Work", description: "Your design was downloaded 10+ times", icon: "📥" },
] as const;

export type BadgeId = (typeof BADGE_DEFS)[number]["id"];
