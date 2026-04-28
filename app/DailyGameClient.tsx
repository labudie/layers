/* eslint-disable @next/next/no-img-element */
"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { usePostHog } from "posthog-js/react";
import { AnimatePresence, motion } from "framer-motion";
import { AppSiteChrome } from "@/app/components/AppSiteChrome";
import { BadgeUnlockSheet } from "@/app/components/BadgeUnlockSheet";
import { GameplayProfileSheet } from "@/app/components/GameplayProfileSheet";
import { PullToRefresh } from "@/app/components/PullToRefresh";
import type { Challenge } from "./page";
import { todayYYYYMMDDUSEastern } from "@/lib/today-us-eastern";
import {
  FirstPlayTutorial,
  TUTORIAL_SEEN_KEY,
} from "@/app/FirstPlayTutorial";
import { supabase } from "@/lib/supabase";
import { BADGE_UNLOCK_ORDER, type BadgeId } from "@/lib/badges";
import {
  playDialPadTone,
  playCloseGuessSound,
  playCorrectGuessSound,
  playWrongGuessSound,
  readGameSoundEnabled,
} from "@/lib/game-sound";
import { AtHandle } from "@/lib/AtHandle";
import {
  CreatorProfileLink,
  profileHandleLinkClass,
  ProfileUsernameLink,
} from "@/lib/profile-handle-link";
import { APP_LOGO_INGAME_SRC } from "@/lib/app-logo";
import { SITE_SHARE_URL } from "@/lib/site-url";
import { stripAtHandle } from "@/lib/username-display";

type GuessRow = {
  value: number;
  verdict: "correct" | "close" | "wrong";
  direction: "high" | "low" | "equal";
  closeness: number;
};

const MAX_GUESSES = 3;

/** Image modal scrim at rest; near-opaque for fullscreen focus. */
const MODAL_SCRIM_MAX_OPACITY = 0.95;

function clamp01(n: number) {
  return Math.max(0, Math.min(1, n));
}

function formatHMS(totalSeconds: number) {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(
    sec
  ).padStart(2, "0")}`;
}

function secondsUntilLocalMidnight(now: Date) {
  const next = new Date(now);
  next.setHours(24, 0, 0, 0);
  return Math.floor((next.getTime() - now.getTime()) / 1000);
}

function easternYMD(date: Date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const y = parts.find((p) => p.type === "year")?.value;
  const m = parts.find((p) => p.type === "month")?.value;
  const d = parts.find((p) => p.type === "day")?.value;
  return `${y}-${m}-${d}`;
}

/** Hour 0–23 in US Eastern for the given instant. */
function easternHour24(now: Date = new Date()) {
  const hourStr = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    hour: "numeric",
    hour12: false,
  }).format(now);
  return Math.min(23, Math.max(0, parseInt(hourStr, 10) || 0));
}

function ymdDaysAgo(days: number, from: Date = new Date()) {
  const d = new Date(from);
  d.setDate(d.getDate() - days);
  return easternYMD(d);
}

/** Seconds until the US Eastern calendar day rolls over (daily puzzle reset). */
function secondsUntilEasternMidnight(from: Date = new Date()): number {
  const d0 = easternYMD(from);
  let lo = from.getTime();
  let hi = from.getTime() + 48 * 3600 * 1000;
  for (let i = 0; i < 48; i++) {
    const mid = lo + (hi - lo) / 2;
    if (easternYMD(new Date(mid)) === d0) lo = mid;
    else hi = mid;
  }
  return Math.max(0, Math.ceil((hi - from.getTime()) / 1000));
}

function formatFriendlyEasternToday() {
  return new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "America/New_York",
  });
}

/** Long month + day + year in US Eastern (e.g. "March 27, 2026"). */
function formatLeaderboardPreviewDateEastern() {
  return new Date().toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "America/New_York",
  });
}

function shortUserIdLabel(userId: string) {
  const id = userId?.trim() ?? "";
  return id.length <= 8 ? id : `${id.slice(0, 8)}…`;
}

function mulberry32(seed: number) {
  let t = seed >>> 0;
  return function rand() {
    t += 0x6d2b79f5;
    let x = Math.imul(t ^ (t >>> 15), 1 | t);
    x ^= x + Math.imul(x ^ (x >>> 7), 61 | x);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

function drawProcedural(canvas: HTMLCanvasElement, seed: number) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const dpr = Math.max(1, Math.floor(window.devicePixelRatio || 1));
  const cssW = canvas.clientWidth || 720;
  const cssH = canvas.clientHeight || 420;
  canvas.width = Math.floor(cssW * dpr);
  canvas.height = Math.floor(cssH * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  const rand = mulberry32(seed);

  const g = ctx.createLinearGradient(0, 0, cssW, cssH);
  g.addColorStop(0, `hsl(${Math.floor(rand() * 360)}, 60%, 10%)`);
  g.addColorStop(1, `hsl(${Math.floor(rand() * 360)}, 60%, 16%)`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, cssW, cssH);

  for (let i = 0; i < 18; i++) {
    const x = rand() * cssW;
    const y = rand() * cssH;
    const r = 30 + rand() * 140;
    const hue = Math.floor(rand() * 360);
    const a = 0.08 + rand() * 0.12;
    const rg = ctx.createRadialGradient(x, y, 0, x, y, r);
    rg.addColorStop(0, `hsla(${hue}, 70%, 60%, ${a})`);
    rg.addColorStop(1, `hsla(${hue}, 70%, 60%, 0)`);
    ctx.fillStyle = rg;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.globalAlpha = 0.9;
  for (let i = 0; i < 10; i++) {
    const hue = Math.floor(rand() * 360);
    ctx.strokeStyle = `hsla(${hue}, 75%, 70%, 0.35)`;
    ctx.lineWidth = 1 + rand() * 2;
    ctx.beginPath();
    const y0 = rand() * cssH;
    ctx.moveTo(-20, y0);
    for (let x = 0; x <= cssW + 20; x += 40) {
      const y =
        y0 +
        Math.sin((x / cssW) * Math.PI * 2 + rand() * 3) *
          (10 + rand() * 35);
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  ctx.fillStyle = "rgba(255,255,255,0.07)";
  ctx.font =
    "700 64px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial";
  ctx.fillText("layers", 18, cssH - 28);
}

function verdictForGuess(guess: number, answer: number) {
  if (guess === answer) {
    return {
      verdict: "correct" as const,
      direction: "equal" as const,
      closeness: 1,
    };
  }
  const diff = Math.abs(guess - answer);
  const rel = answer === 0 ? 1 : diff / answer;
  const close = rel <= 0.15;
  const closeness = clamp01(1 - rel);
  return {
    verdict: close ? ("close" as const) : ("wrong" as const),
    direction: guess > answer ? ("high" as const) : ("low" as const),
    closeness,
  };
}

function emojiForVerdict(v: GuessRow["verdict"]) {
  if (v === "correct") return "🟩";
  if (v === "close") return "🟨";
  return "🟥";
}

function safeVibrate(pattern: number | number[]) {
  if (
    typeof navigator === "undefined" ||
    typeof navigator.vibrate !== "function"
  ) {
    return;
  }
  navigator.vibrate(pattern);
}

function applyGuessFeedback(verdict: GuessRow["verdict"]) {
  if (verdict === "wrong") safeVibrate(50);
  else if (verdict === "correct") safeVibrate([50, 30, 50]);
  else if (verdict === "close") safeVibrate(30);
  if (!readGameSoundEnabled()) return;
  if (verdict === "wrong") playWrongGuessSound();
  else if (verdict === "correct") playCorrectGuessSound();
  else if (verdict === "close") playCloseGuessSound();
}

function playStartupReadyChime() {
  if (typeof window === "undefined" || !readGameSoundEnabled()) return;
  const Ctx =
    window.AudioContext ||
    (window as typeof window & { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;
  if (!Ctx) return;
  try {
    const ctx = new Ctx();
    const startAt = ctx.currentTime + 0.01;
    const CHIME_GAIN = 0.08;
    const CHIME_DURATION = 0.15;
    const CHIME_GAP = 0.08;

    const playOne = (freqHz: number, at: number) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(freqHz, at);
      gain.gain.setValueAtTime(CHIME_GAIN, at);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + CHIME_DURATION);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(at);
      osc.stop(at + CHIME_DURATION);
    };

    playOne(600, startAt);
    playOne(900, startAt + CHIME_DURATION + CHIME_GAP);

    window.setTimeout(() => {
      void ctx.close().catch(() => {
        // ignore
      });
    }, 650);
  } catch {
    // ignore autoplay/gesture-related WebAudio errors
  }
}

function playPerfectCompletionChime() {
  if (typeof window === "undefined" || !readGameSoundEnabled()) return;
  const Ctx =
    window.AudioContext ||
    (window as typeof window & { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;
  if (!Ctx) return;
  try {
    const ctx = new Ctx();
    const startAt = ctx.currentTime + 0.01;
    const MASTER_GAIN = 0.18;

    const playOne = (freqHz: number, at: number, duration: number) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(freqHz, at);
      gain.gain.setValueAtTime(MASTER_GAIN, at);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + duration);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(at);
      osc.stop(at + duration);
    };

    const arp = [400, 500, 600, 800, 1000, 1200];
    const arpDur = 0.08;
    for (let i = 0; i < arp.length; i++) {
      playOne(arp[i], startAt + i * arpDur, arpDur);
    }
    const triumphantStart = startAt + arp.length * arpDur + 0.1;
    const triumphant = [1200, 1000, 1200];
    const triDur = 0.2;
    for (let i = 0; i < triumphant.length; i++) {
      playOne(triumphant[i], triumphantStart + i * triDur, triDur);
    }

    window.setTimeout(() => {
      void ctx.close().catch(() => {
        // ignore
      });
    }, 1700);
  } catch {
    // ignore autoplay/gesture-related WebAudio errors
  }
}

function playStandardCompletionChime() {
  if (typeof window === "undefined" || !readGameSoundEnabled()) return;
  const Ctx =
    window.AudioContext ||
    (window as typeof window & { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;
  if (!Ctx) return;
  try {
    const ctx = new Ctx();
    const startAt = ctx.currentTime + 0.01;
    const MASTER_GAIN = 0.12;

    const playOne = (freqHz: number, at: number, duration: number) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(freqHz, at);
      gain.gain.setValueAtTime(MASTER_GAIN, at);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + duration);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(at);
      osc.stop(at + duration);
    };

    const seq = [500, 700, 900];
    const seqDur = 0.1;
    for (let i = 0; i < seq.length; i++) {
      playOne(seq[i], startAt + i * seqDur, seqDur);
    }

    const chordStart = startAt + seq.length * seqDur;
    playOne(600, chordStart, 0.3);
    playOne(900, chordStart, 0.3);

    window.setTimeout(() => {
      void ctx.close().catch(() => {
        // ignore
      });
    }, 900);
  } catch {
    // ignore autoplay/gesture-related WebAudio errors
  }
}

function isChallengeFinished(
  answer: number | null | undefined,
  guesses: GuessRow[]
) {
  if (!answer || answer <= 0) return false;
  return (
    guesses.some((g) => g.verdict === "correct") ||
    guesses.length >= MAX_GUESSES
  );
}

function canvasSeedForChallenge(ch: Challenge): number {
  let h = 0;
  for (let i = 0; i < ch.id.length; i++) {
    h = (Math.imul(31, h) + ch.id.charCodeAt(i)) | 0;
  }
  return (
    (Math.abs(h) % 1_000_000) +
    (ch.day_number ?? 0) * 1_000 +
    (ch.position ?? 0)
  );
}

function creatorUsernameKey(raw: string | null | undefined) {
  return stripAtHandle(raw ?? "").trim().toLowerCase();
}

function GameplayCreatorProfileLink({
  raw,
  onOpenProfile,
}: {
  raw: string | null | undefined;
  onOpenProfile: (handle: string) => void;
}) {
  const b = stripAtHandle(raw ?? "");
  if (!b.length) return "—";
  return (
    <button
      type="button"
      className={`${profileHandleLinkClass} cursor-pointer border-none bg-transparent p-0 font-inherit`}
      onClick={() => onOpenProfile(b)}
    >
      <AtHandle>@{b}</AtHandle>
    </button>
  );
}

function HomeGameSkeleton() {
  return (
    <div
      className="mt-3 flex min-h-[50vh] flex-1 animate-pulse flex-col gap-4 pb-6 min-w-0"
      aria-busy
      aria-label="Loading today’s puzzles"
    >
      <div className="h-[min(60vh,28rem)] w-full max-w-full rounded-xl bg-white/[0.06] blur-[1px]" />
      <div className="space-y-2">
        <div className="h-5 w-[60%] max-w-xs rounded-lg bg-white/[0.08]" />
        <div className="h-4 w-24 rounded-md bg-white/[0.06]" />
      </div>
      <div className="flex gap-2">
        <div className="h-11 flex-1 rounded-full bg-white/[0.07]" />
        <div className="h-11 w-28 shrink-0 rounded-full bg-[var(--accent)]/30" />
      </div>
      <p className="text-center text-xs text-white/40">Loading your progress…</p>
    </div>
  );
}

function CreatorResultAvatar({
  creatorName,
  avatarByUsername,
}: {
  creatorName: string | null;
  avatarByUsername: Map<string, string | null>;
}) {
  const key = creatorUsernameKey(creatorName);
  const avatarUrl = key ? avatarByUsername.get(key) : undefined;
  const handle = stripAtHandle(creatorName ?? "");
  const initial = (handle.slice(0, 1) || "?").toUpperCase();
  return (
    <div className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full border border-white/10 bg-[var(--accent)]">
      {avatarUrl ? (
        <img
          src={avatarUrl}
          alt=""
          className="h-full w-full object-cover"
        />
      ) : (
        <span className="text-sm font-extrabold text-[var(--text)]">
          {initial}
        </span>
      )}
    </div>
  );
}

export function DailyGameClient({
  challenges: challengesFromServer,
  userEmail,
  userId,
  profileUsername: _profileUsername,
  profileAvatarUrl: _profileAvatarUrl,
  profileStreak: _profileStreak = 0,
  profileTotalSolved: _profileTotalSolved = 0,
  lastPlayedDate,
}: {
  challenges: Challenge[];
  userEmail: string | null;
  userId: string | null;
  profileUsername?: string | null;
  profileAvatarUrl?: string | null;
  profileStreak?: number;
  profileTotalSolved?: number;
  lastPlayedDate?: string | null;
}) {
  void _profileUsername;
  void _profileAvatarUrl;
  void _profileStreak;
  void _profileTotalSolved;

  const [challengesPulled, setChallengesPulled] = useState<Challenge[] | null>(
    null,
  );
  const serverChallengeIdsKey = useMemo(
    () => challengesFromServer.map((c) => c.id).join(","),
    [challengesFromServer],
  );
  useEffect(() => {
    setChallengesPulled(null);
  }, [serverChallengeIdsKey]);

  const challenges = challengesPulled ?? challengesFromServer;

  const total = challenges.length;
  const dayNumber = challenges[0]?.day_number ?? null;
  const signedIn = Boolean(userEmail);
  const posthog = usePostHog();

  const refreshTodayChallenges = useCallback(async () => {
    const todayEastern = todayYYYYMMDDUSEastern();
    const { data, error } = await supabase()
      .from("challenges")
      .select(
        "id, position, title, creator_name, day_number, software, category, layer_count, image_url, is_sponsored, sponsor_name",
      )
      .eq("active_date", todayEastern)
      .order("position", { ascending: true });
    console.log("[DailyGameClient][refresh today challenges]", {
      todayEastern,
      count: data?.length ?? 0,
      rows: data ?? [],
      error: error ?? null,
    });
    if (error) {
      console.error("[DailyGameClient] pull refresh challenges", error);
      return;
    }
    setChallengesPulled((data ?? []) as Challenge[]);
  }, []);
  const shareLayersInvite = useCallback(async () => {
    const shareText = "Check out Layers — a daily design game for creatives";
    const shareUrl = "https://layersgame.com";
    const sharePayload = {
      title: "Layers",
      text: shareText,
      url: shareUrl,
    };

    try {
      if (
        typeof navigator !== "undefined" &&
        typeof navigator.share === "function" &&
        (!navigator.canShare || navigator.canShare(sharePayload))
      ) {
        await navigator.share(sharePayload);
        return;
      }
    } catch (e) {
      if ((e as Error)?.name === "AbortError") return;
    }

    try {
      await navigator.clipboard.writeText(`${shareText}\n${shareUrl}`);
    } catch {
      /* ignore */
    }
  }, []);

  const challengeIdsKey = useMemo(
    () => challenges.map((c) => c.id).join(","),
    [challenges]
  );

  const [countdownText, setCountdownText] = useState<string | null>(null);
  const [guessInput, setGuessInput] = useState<number | "">("");
  const [guessesByIndex, setGuessesByIndex] = useState<GuessRow[][]>(() =>
    challenges.map(() => [])
  );
  const [currentChallengeIndex, setCurrentChallengeIndex] = useState(0);
  const [showSummary, setShowSummary] = useState(false);

  const solvedTodayCount = useMemo(
    () =>
      guessesByIndex.reduce(
        (acc, g) => acc + (g.some((x) => x.verdict === "correct") ? 1 : 0),
        0
      ),
    [guessesByIndex]
  );
  /** When true, show full per-challenge results; when false but showSummary, show premium daily home. */
  const [showResultsDetail, setShowResultsDetail] = useState(false);
  const [leaderPreview, setLeaderPreview] = useState<
    Array<{
      rank: number;
      userId: string;
      username: string | null;
      totalAttempts: number;
    }>
  >([]);
  const [easternHeroSeconds, setEasternHeroSeconds] = useState(0);
  const [shareFeedback, setShareFeedback] = useState<"idle" | "copied" | "shared">(
    "idle",
  );
  const [gameDataReady, setGameDataReady] = useState(
    () => challengesFromServer.length === 0,
  );

  const showDailyHome = total > 0 && showSummary && !showResultsDetail;
  const showNoChallengesHome = total === 0;

  /** After a correct submit, brief hold before auto-advance (no "Next" click). */
  const [pendingAutoAdvance, setPendingAutoAdvance] = useState(false);
  /** After a failed round (max guesses), auto-advance after short reveal delay. */
  const [pendingFailedAutoAdvance, setPendingFailedAutoAdvance] = useState(false);
  /** Opacity fade on title, attempt rows, input — main challenge image uses its own load fade. */
  const [challengeTransitioning, setChallengeTransitioning] = useState(false);
  /** Hydration-safe: dynamic transition classes only after mount. */
  const [mounted, setMounted] = useState(false);
  const [infoPopoverOpen, setInfoPopoverOpen] = useState(false);
  const [profilePreviewHandle, setProfilePreviewHandle] = useState<
    string | null
  >(null);
  const infoButtonRef = useRef<HTMLButtonElement | null>(null);
  const infoPopoverRef = useRef<HTMLDivElement | null>(null);
  const guessInputRef = useRef<HTMLInputElement | null>(null);
  const tutorialImageRef = useRef<HTMLDivElement | null>(null);
  const [modalImageUrl, setModalImageUrl] = useState<string | null>(null);
  const [modalScale, setModalScale] = useState(1);
  const [modalOffset, setModalOffset] = useState({ x: 0, y: 0 });
  const [imageFeedbackClassName, setImageFeedbackClassName] = useState("");
  const [confettiBursts, setConfettiBursts] = useState<number[]>([]);
  const [shareBusyId, setShareBusyId] = useState<string | null>(null);
  const [tutorialStep, setTutorialStep] = useState<1 | 2 | 3 | null>(null);
  const [creatorAvatars, setCreatorAvatars] = useState<
    Map<string, string | null>
  >(() => new Map());
  const [challengeMainImageLoaded, setChallengeMainImageLoaded] =
    useState(true);
  const prevChallengeImageIdRef = useRef<string | null | undefined>(undefined);

  const autoAdvanceTimeoutRef = useRef<number | null>(null);
  const fadeTimeoutRef = useRef<number | null>(null);
  const revealTimeoutRef = useRef<number | null>(null);
  const imageFeedbackTimeoutRef = useRef<number | null>(null);
  const confettiTimeoutsRef = useRef<number[]>([]);
  const statsSyncKeyRef = useRef<string | null>(null);
  const [badgeUnlockQueue, setBadgeUnlockQueue] = useState<BadgeId[]>([]);
  const startedChallengeIdsRef = useRef<Set<string>>(new Set());
  const completedChallengeIdsRef = useRef<Set<string>>(new Set());
  const dailyCompletedKeyRef = useRef<string | null>(null);
  const modalPullStartYRef = useRef<number | null>(null);
  const modalScaleRef = useRef(modalScale);
  const [modalPullDy, setModalPullDy] = useState(0);
  const [modalPullDragging, setModalPullDragging] = useState(false);
  /** After release: spring image/backdrop to rest, or play dismiss exit. */
  const [modalPullTransition, setModalPullTransition] = useState<
    null | "spring" | "dismiss"
  >(null);
  /** Scrim opacity (0–1); kept below 1 so live gameplay stays visible through the overlay. */
  const [modalBackdropOpacity, setModalBackdropOpacity] = useState(
    MODAL_SCRIM_MAX_OPACITY,
  );
  const [modalPortalEl, setModalPortalEl] = useState<HTMLElement | null>(null);
  const modalLayerRef = useRef<HTMLDivElement | null>(null);
  const modalPullDyRef = useRef(0);
  const pinchStartDistanceRef = useRef<number | null>(null);
  const pinchStartScaleRef = useRef(1);
  const panStartRef = useRef<{ x: number; y: number } | null>(null);
  const panStartOffsetRef = useRef({ x: 0, y: 0 });
  const lastTapRef = useRef<{ ts: number; x: number; y: number } | null>(null);
  const hasPlayedCompletionSoundRef = useRef(false);
  const hasPlayedStartSoundRef = useRef(false);
  const guessTrackerRef = useRef<{ challengeIdx: number; len: number }>({
    challengeIdx: -1,
    len: 0,
  });
  const [guessSlotAnimIndex, setGuessSlotAnimIndex] = useState<number | null>(
    null,
  );

  const challengesRef = useRef(challenges);
  useEffect(() => {
    challengesRef.current = challenges;
  }, [challengeIdsKey]);

  useEffect(() => {
    const list = challengesRef.current;
    if (!list.length) {
      setCreatorAvatars(new Map());
      return;
    }
    const keys = new Set<string>();
    for (const ch of list) {
      const k = creatorUsernameKey(ch.creator_name);
      if (k) keys.add(k);
    }
    if (keys.size === 0) {
      setCreatorAvatars(new Map());
      return;
    }
    let cancelled = false;
    const arr = Array.from(keys);
    void (async () => {
      const sb = supabase();
      const map = new Map<string, string | null>();
      const chunk = 100;
      for (let i = 0; i < arr.length; i += chunk) {
        const slice = arr.slice(i, i + chunk);
        const { data, error } = await sb
          .from("profiles")
          .select("username, avatar_url")
          .in("username", slice);
        if (cancelled) return;
        if (error) {
          console.error("[DailyGameClient] creator avatars", error);
          continue;
        }
        for (const row of data ?? []) {
          const r = row as { username?: string | null; avatar_url?: string | null };
          const u = r.username?.trim().toLowerCase();
          if (u) map.set(u, r.avatar_url?.trim() || null);
        }
      }
      if (!cancelled) setCreatorAvatars(map);
    })();
    return () => {
      cancelled = true;
    };
  }, [challengeIdsKey]);

  useEffect(() => {
    prevChallengeImageIdRef.current = undefined;
  }, [challengeIdsKey]);

  useEffect(() => {
    setMounted(true);
  }, []);

  const dismissTutorial = useCallback(() => {
    try {
      localStorage.setItem(TUTORIAL_SEEN_KEY, "true");
    } catch {
      /* ignore */
    }
    setTutorialStep(null);
  }, []);

  useEffect(() => {
    if (showSummary) setTutorialStep(null);
  }, [showSummary]);

  useEffect(() => {
    if (!signedIn || !userId) return;
    try {
      if (localStorage.getItem(TUTORIAL_SEEN_KEY) === "true") return;
    } catch {
      return;
    }
    const hasPlayed =
      lastPlayedDate != null && String(lastPlayedDate).trim() !== "";
    if (hasPlayed) return;
    if (total < 1) return;
    if (showSummary) return;
    setTutorialStep((prev) => (prev === null ? 1 : prev));
  }, [signedIn, userId, lastPlayedDate, total, showSummary]);

  useEffect(() => {
    setInfoPopoverOpen(false);
  }, [currentChallengeIndex, challengeIdsKey]);

  useEffect(() => {
    modalScaleRef.current = modalScale;
  }, [modalScale]);

  useEffect(() => {
    if (modalScale > 1) {
      setModalPullDy(0);
      modalPullDyRef.current = 0;
      modalPullStartYRef.current = null;
      setModalPullDragging(false);
      setModalPullTransition(null);
      setModalBackdropOpacity(MODAL_SCRIM_MAX_OPACITY);
    }
  }, [modalScale]);

  useEffect(() => {
    if (!modalImageUrl) {
      setModalPullDy(0);
      modalPullDyRef.current = 0;
      modalPullStartYRef.current = null;
      setModalPullDragging(false);
      setModalPullTransition(null);
      setModalBackdropOpacity(MODAL_SCRIM_MAX_OPACITY);
    }
  }, [modalImageUrl]);

  useEffect(() => {
    setModalPortalEl(document.body);
  }, []);

  useEffect(() => {
    if (!modalImageUrl) return;
    const el = modalLayerRef.current;
    if (!el) return;
    const onTouchMove = (e: TouchEvent) => {
      if (modalScaleRef.current > 1) return;
      if (e.touches.length === 1) e.preventDefault();
    };
    el.addEventListener("touchmove", onTouchMove, { capture: true, passive: false });
    return () => {
      el.removeEventListener("touchmove", onTouchMove, { capture: true });
    };
  }, [modalImageUrl]);

  useEffect(() => {
    modalPullDyRef.current = modalPullDy;
  }, [modalPullDy]);

  useEffect(() => {
    if (!infoPopoverOpen) return;
    const onPointerDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (
        infoPopoverRef.current?.contains(t) ||
        infoButtonRef.current?.contains(t)
      ) {
        return;
      }
      setInfoPopoverOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [infoPopoverOpen]);

  useEffect(() => {
    return () => {
      if (autoAdvanceTimeoutRef.current != null) {
        window.clearTimeout(autoAdvanceTimeoutRef.current);
        autoAdvanceTimeoutRef.current = null;
      }
      if (fadeTimeoutRef.current != null) {
        window.clearTimeout(fadeTimeoutRef.current);
        fadeTimeoutRef.current = null;
      }
      if (revealTimeoutRef.current != null) {
        window.clearTimeout(revealTimeoutRef.current);
        revealTimeoutRef.current = null;
      }
      if (imageFeedbackTimeoutRef.current != null) {
        window.clearTimeout(imageFeedbackTimeoutRef.current);
        imageFeedbackTimeoutRef.current = null;
      }
      for (const t of confettiTimeoutsRef.current) {
        window.clearTimeout(t);
      }
      confettiTimeoutsRef.current = [];
    };
  }, []);

  useEffect(() => {
    if (showSummary) setChallengeTransitioning(false);
  }, [showSummary]);

  useEffect(() => {
    const startedChallenge = challenges[currentChallengeIndex];
    if (showSummary || !startedChallenge?.id) return;
    if (startedChallengeIdsRef.current.has(startedChallenge.id)) return;
    startedChallengeIdsRef.current.add(startedChallenge.id);
    posthog?.capture("challenge_started", {
      challenge_id: startedChallenge.id,
      challenge_index: currentChallengeIndex + 1,
    });
  }, [showSummary, challenges, currentChallengeIndex, posthog]);

  useEffect(() => {
    if (autoAdvanceTimeoutRef.current != null) {
      window.clearTimeout(autoAdvanceTimeoutRef.current);
      autoAdvanceTimeoutRef.current = null;
    }
    if (fadeTimeoutRef.current != null) {
      window.clearTimeout(fadeTimeoutRef.current);
      fadeTimeoutRef.current = null;
    }
    if (revealTimeoutRef.current != null) {
      window.clearTimeout(revealTimeoutRef.current);
      revealTimeoutRef.current = null;
    }
    setPendingAutoAdvance(false);
    setChallengeTransitioning(false);
  }, [challengeIdsKey]);

  const currentChallenge = challenges[currentChallengeIndex] ?? null;
  const displayChallengeImageUrl = useMemo(
    () => currentChallenge?.image_url ?? null,
    [currentChallenge?.image_url],
  );

  useEffect(() => {
    const id = currentChallenge?.id;
    if (prevChallengeImageIdRef.current === undefined) {
      prevChallengeImageIdRef.current = id;
      setChallengeMainImageLoaded(Boolean(displayChallengeImageUrl));
      return;
    }
    if (id !== prevChallengeImageIdRef.current) {
      prevChallengeImageIdRef.current = id;
      if (displayChallengeImageUrl) setChallengeMainImageLoaded(false);
      else setChallengeMainImageLoaded(true);
    }
  }, [currentChallenge?.id, displayChallengeImageUrl]);

  useEffect(() => {
    if (!displayChallengeImageUrl) return;
    const probe = new Image();
    probe.src = displayChallengeImageUrl;
    if (probe.complete) setChallengeMainImageLoaded(true);
  }, [currentChallenge?.id, displayChallengeImageUrl]);

  useEffect(() => {
    const next = challenges[currentChallengeIndex + 1];
    const u = next?.image_url;
    if (!u) return;
    const im = new Image();
    im.src = u;
  }, [challenges, currentChallengeIndex]);

  const currentGuesses = guessesByIndex[currentChallengeIndex] ?? [];
  const currentGuessCount = currentGuesses.length;

  useEffect(() => {
    const r = guessTrackerRef.current;
    if (r.challengeIdx !== currentChallengeIndex) {
      r.challengeIdx = currentChallengeIndex;
      r.len = currentGuessCount;
      setGuessSlotAnimIndex(null);
      return;
    }
    if (currentGuessCount > r.len) {
      const idx = currentGuessCount - 1;
      setGuessSlotAnimIndex(idx);
      const t = window.setTimeout(() => setGuessSlotAnimIndex(null), 480);
      r.len = currentGuessCount;
      return () => window.clearTimeout(t);
    }
    r.len = currentGuessCount;
  }, [currentChallengeIndex, currentGuessCount]);

  const currentAnswer = currentChallenge?.layer_count ?? null;
  const challengeMeta = currentChallenge as
    | (Challenge & {
        is_sponsored?: boolean | null;
        sponsor_name?: string | null;
      })
    | null;
  const isSponsored = challengeMeta?.is_sponsored === true;
  const sponsorName = isSponsored ? challengeMeta?.sponsor_name ?? null : null;

  const currentFinished = useMemo(
    () => isChallengeFinished(currentAnswer, currentGuesses),
    [currentAnswer, currentGuesses]
  );

  const solvedWithCorrect = currentGuesses.some((g) => g.verdict === "correct");
  const failedWithMaxGuesses =
    currentFinished &&
    !solvedWithCorrect &&
    currentGuesses.length >= MAX_GUESSES;

  /** Current puzzle round is playable (input may be used; submit needs auth). */
  const roundActive = Boolean(
    !showSummary &&
      currentChallenge?.id &&
      currentAnswer &&
      currentAnswer > 0 &&
      !currentFinished
  );

  /** Persisting guesses/results requires a signed-in user. */
  const canSubmitGuess = Boolean(
    roundActive && signedIn && userId
  );
  const compactGameplayMode = Boolean(
    !showNoChallengesHome && !showDailyHome && !showSummary
  );

  const persistChallengeResult = useCallback(
    async (args: {
      challengeId: string;
      guesses: GuessRow[];
      layerCount: number;
      position: number | undefined;
      fallbackIndex: number;
    }) => {
      const { challengeId, guesses, layerCount, position, fallbackIndex } =
        args;
      if (!layerCount || layerCount <= 0) return;
      if (guesses.length === 0) return;
      if (!isChallengeFinished(layerCount, guesses)) return;

      const sb = supabase();
      const {
        data: { user },
        error: authError,
      } = await sb.auth.getUser();
      if (authError) {
        console.error("[results] auth error", authError);
        return;
      }
      if (!user?.id) return;

      const solved = guesses.some((x) => x.verdict === "correct");
      const attempts_used = guesses.length;

      const positionVal =
        typeof position === "number" ? position : fallbackIndex + 1;

      console.log("[results] saving result", {
        user_id: user.id,
        challenge_id: challengeId,
        solved,
        attempts_used,
      });

      const { error } = await sb.from("results").upsert(
        {
          user_id: user.id,
          challenge_id: challengeId,
          solved,
          attempts_used,
          position: positionVal,
        },
        { onConflict: "user_id,challenge_id" }
      );
      if (error) {
        console.error(
          "[results] error saving - full details:",
          JSON.stringify(error)
        );
        console.error("[results] error code:", error.code);
        console.error("[results] error message:", error.message);
        console.error("[results] error details:", error.details);
        console.error("[results] error hint:", error.hint);
      }
    },
    []
  );

  // Restore guesses + resume position / summary
  useEffect(() => {
    const list = challengesRef.current;
    let cancelled = false;

    if (!list.length) {
      setGameDataReady(true);
    } else if (!userId) {
      setGameDataReady(true);
    } else {
      setGameDataReady(false);
    }

    (async () => {
      if (!list.length) {
        if (!cancelled) {
          setGuessesByIndex([]);
          setCurrentChallengeIndex(0);
          setShowSummary(false);
          setGameDataReady(true);
        }
        return;
      }

      if (!userId) {
        if (!cancelled) {
          setGuessesByIndex(list.map(() => []));
          setCurrentChallengeIndex(0);
          setShowSummary(false);
          setGameDataReady(true);
        }
        return;
      }

      const matrix: GuessRow[][] = [];

      for (const ch of list) {
        const answer = ch.layer_count;
        if (!ch.id || !answer || answer <= 0) {
          matrix.push([]);
          continue;
        }

        const { data, error } = await supabase()
          .from("guesses")
          .select("guess, attempt_number")
          .eq("user_id", userId)
          .eq("challenge_id", ch.id)
          .order("attempt_number", { ascending: true });

        if (cancelled || error || !data?.length) {
          matrix.push([]);
          continue;
        }

        const restored: GuessRow[] = data.map((row: { guess: unknown }) => {
          const v = Math.max(0, Math.floor(Number(row.guess)));
          const meta = verdictForGuess(v, answer);
          return { value: v, ...meta };
        });
        matrix.push(restored.slice(0, MAX_GUESSES));
      }

      if (cancelled) return;

      while (matrix.length < list.length) {
        matrix.push([]);
      }

      setGuessesByIndex(matrix);

      let allDone = true;
      let firstOpen = 0;
      for (let i = 0; i < list.length; i++) {
        const ans = list[i].layer_count ?? 0;
        const g = matrix[i] ?? [];
        const fin = isChallengeFinished(ans, g);
        if (!fin) {
          allDone = false;
          firstOpen = i;
          break;
        }
      }

      if (allDone) {
        setShowSummary(true);
        setCurrentChallengeIndex(Math.max(0, list.length - 1));
      } else {
        setShowSummary(false);
        setCurrentChallengeIndex(firstOpen);
      }

      if (!cancelled) {
        setGameDataReady(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [userId, challengeIdsKey]);

  // Backfill results per finished challenge (e.g. after hydration); primary path is submitGuess.
  useEffect(() => {
    if (!userId || !challenges.length) return;

    let cancelled = false;

    void (async () => {
      const list = challengesRef.current;
      for (let idx = 0; idx < list.length; idx++) {
        if (cancelled) return;
        const ch = list[idx];
        const g = guessesByIndex[idx] ?? [];
        const ans = ch.layer_count ?? 0;
        await persistChallengeResult({
          challengeId: ch.id,
          guesses: g,
          layerCount: ans,
          position:
            typeof ch.position === "number" ? ch.position : undefined,
          fallbackIndex: idx,
        });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [userId, challengeIdsKey, guessesByIndex, persistChallengeResult]);

  // Update profile streak/stats/badges after the user completes today's 5 challenges.
  useEffect(() => {
    if (!userId || !showSummary || challenges.length !== 5) return;
    if (!challenges.every((c) => Boolean(c.id))) return;

    const today = easternYMD(new Date());
    const uniqueKey = `${userId}:${today}:${challengeIdsKey}`;
    if (statsSyncKeyRef.current === uniqueKey) return;

    const solvedTodayCount = guessesByIndex.reduce(
      (acc, g) => acc + (g.some((x) => x.verdict === "correct") ? 1 : 0),
      0
    );
    const allFiveSolved = solvedTodayCount === 5;
    const allFiveFinished = challenges.every((ch, i) =>
      isChallengeFinished(ch.layer_count, guessesByIndex[i] ?? [])
    );
    const sharpEye = guessesByIndex.some(
      (g) => g.length === 1 && g[0]?.verdict === "correct"
    );
    const dailyRows = guessesByIndex.reduce((acc, g) => acc + g.length, 0);
    if (dailyRows === 0) return;

    let cancelled = false;

    (async () => {
      const sb = supabase();
      const { data: profile, error: profileErr } = await sb
        .from("profiles")
        .select(
          "username, current_streak, longest_streak, total_solved, perfect_days, last_played_date, badges"
        )
        .eq("id", userId)
        .maybeSingle();

      if (cancelled) return;
      if (profileErr) {
        console.error("[profiles] error loading for daily sync", profileErr);
        return;
      }

      const row = (profile as {
        username?: string | null;
        current_streak?: number | null;
        longest_streak?: number | null;
        total_solved?: number | null;
        perfect_days?: number | null;
        last_played_date?: string | null;
        badges?: string[] | null;
      } | null) ?? { badges: [] };

      if (row.last_played_date === today) {
        statsSyncKeyRef.current = uniqueKey;
        return;
      }

      const { data: badgeRows, error: badgeRowsErr } = await sb
        .from("user_badges")
        .select("badge_id")
        .eq("user_id", userId);
      if (badgeRowsErr) {
        console.error("[user_badges] error loading for daily sync", badgeRowsErr);
      }

      const prevBadges = new Set<BadgeId>();
      for (const b of row.badges ?? []) {
        if (typeof b === "string" && b.length) prevBadges.add(b as BadgeId);
      }
      for (const r of badgeRows ?? []) {
        const id = (r as { badge_id?: string }).badge_id;
        if (id) prevBadges.add(id as BadgeId);
      }

      const yesterday = ymdDaysAgo(1, new Date());
      const prevStreak = row.current_streak ?? 0;
      const nextStreak = row.last_played_date === yesterday ? prevStreak + 1 : 1;
      const nextLongest = Math.max(row.longest_streak ?? 0, nextStreak);
      const nextTotalSolved = (row.total_solved ?? 0) + solvedTodayCount;
      const nextPerfectDays =
        (row.perfect_days ?? 0) + (allFiveSolved ? 1 : 0);

      const nextBadges = new Set<BadgeId>(prevBadges);
      nextBadges.add("first_play");
      if (sharpEye) nextBadges.add("sharp_eye");
      if (allFiveSolved) nextBadges.add("perfect_day");
      if (allFiveFinished) nextBadges.add("layer_up");
      if (allFiveFinished && easternHour24() < 12) {
        nextBadges.add("early_bird");
      }
      if (nextStreak >= 3) nextBadges.add("on_a_roll");
      if (nextStreak >= 5) nextBadges.add("hot_streak");
      if (nextStreak >= 7) nextBadges.add("week_streak");
      if (nextStreak >= 30) nextBadges.add("month_streak");

      const { count: lifetimeGuessCount, error: guessCountErr } = await sb
        .from("guesses")
        .select("*", { count: "exact", head: true })
        .eq("user_id", userId);
      if (guessCountErr) {
        console.error("[guesses] count for badges", guessCountErr);
      } else {
        const n = lifetimeGuessCount ?? 0;
        if (n >= 50) nextBadges.add("guessing_game");
        if (n >= 100) nextBadges.add("century");
      }

      const challengeIds = challenges.map((c) => c.id);
      const { data: topDaily } = await sb
        .from("results")
        .select("user_id")
        .in("challenge_id", challengeIds)
        .order("attempts_used", { ascending: true })
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      if ((topDaily as { user_id?: string } | null)?.user_id === userId) {
        nextBadges.add("top_of_stack");
      }

      const username = row.username?.trim() ?? "";
      const handleBase = stripAtHandle(username);
      const creatorNameVariants = Array.from(
        new Set(
          [handleBase, handleBase ? `@${handleBase}` : ""].filter(Boolean)
        )
      );
      if (creatorNameVariants.length > 0) {
        const { count: creatorCount } = await sb
          .from("challenges")
          .select("id", { count: "exact", head: true })
          .in("creator_name", creatorNameVariants);
        if ((creatorCount ?? 0) > 0) {
          nextBadges.add("creator");
        }

        const { data: createdChallenges } = await sb
          .from("challenges")
          .select("id")
          .in("creator_name", creatorNameVariants);
        const createdIds = (createdChallenges ?? []).map(
          (x: { id: string }) => x.id
        );
        if (createdIds.length > 0) {
          const { count: downloadsCount } = await sb
            .from("image_downloads")
            .select("id", { count: "exact", head: true })
            .in("challenge_id", createdIds);
          if ((downloadsCount ?? 0) >= 10) {
            nextBadges.add("popular_work");
          }
        }
      }

      const newlyEarned = BADGE_UNLOCK_ORDER.filter(
        (id) => nextBadges.has(id) && !prevBadges.has(id)
      );

      for (const badgeId of newlyEarned) {
        const { error: insErr } = await sb.from("user_badges").insert({
          user_id: userId,
          badge_id: badgeId,
        });
        if (
          insErr &&
          insErr.code !== "23505" &&
          !String(insErr.message ?? "").includes("duplicate")
        ) {
          console.error("[user_badges] insert after daily complete", insErr);
        }
      }

      const handleStored = stripAtHandle(username);
      const profilePayload: Record<string, unknown> = {
        id: userId,
        current_streak: nextStreak,
        longest_streak: nextLongest,
        total_solved: nextTotalSolved,
        perfect_days: nextPerfectDays,
        last_played_date: today,
        badges: Array.from(nextBadges),
      };
      if (handleStored) {
        profilePayload.username = handleStored;
      }
      const { error: upsertErr } = await sb
        .from("profiles")
        .upsert(profilePayload, { onConflict: "id" });
      if (upsertErr) {
        console.error("[profiles] error upsert after daily complete", upsertErr);
        return;
      }

      if (!cancelled) {
        statsSyncKeyRef.current = uniqueKey;
        if (newlyEarned.length) {
          setBadgeUnlockQueue(newlyEarned);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [userId, showSummary, challengeIdsKey, challenges, guessesByIndex]);

  useEffect(() => {
    if (!showSummary || challenges.length !== 5) return;
    const solvedCount = guessesByIndex.reduce(
      (acc, g) => acc + (g.some((x) => x.verdict === "correct") ? 1 : 0),
      0
    );
    const key = `${challengeIdsKey}:${solvedCount}`;
    if (dailyCompletedKeyRef.current === key) return;
    dailyCompletedKeyRef.current = key;
    posthog?.capture("daily_completed", { total_solved: solvedCount });
  }, [showSummary, challengeIdsKey, challenges.length, guessesByIndex, posthog]);

  useEffect(() => {
    if (!showSummary) {
      hasPlayedCompletionSoundRef.current = false;
      return;
    }
    if (challenges.length !== 5) return;
    const finishedAllFive = challenges.every((ch, i) =>
      isChallengeFinished(ch.layer_count, guessesByIndex[i] ?? [])
    );
    if (!finishedAllFive) return;
    if (hasPlayedCompletionSoundRef.current) return;

    const solvedCount = guessesByIndex.reduce(
      (acc, g) => acc + (g.some((x) => x.verdict === "correct") ? 1 : 0),
      0,
    );
    const totalGuesses = guessesByIndex.reduce((acc, g) => acc + g.length, 0);
    const isPerfect = solvedCount === 5 && totalGuesses <= 7;

    const timeoutId = window.setTimeout(() => {
      if (hasPlayedCompletionSoundRef.current) return;
      hasPlayedCompletionSoundRef.current = true;
      if (isPerfect) playPerfectCompletionChime();
      else playStandardCompletionChime();
    }, 400);
    return () => window.clearTimeout(timeoutId);
  }, [showSummary, challenges, guessesByIndex]);

  useEffect(() => {
    if (hasPlayedStartSoundRef.current) return;
    if (!gameDataReady || challenges.length < 1) return;
    // Don't play when user is on completion/results/no-challenges screens.
    if (showSummary || showDailyHome || showNoChallengesHome) return;
    const timeoutId = window.setTimeout(() => {
      if (hasPlayedStartSoundRef.current) return;
      hasPlayedStartSoundRef.current = true;
      playStartupReadyChime();
    }, 500);
    return () => window.clearTimeout(timeoutId);
  }, [
    gameDataReady,
    challenges.length,
    showSummary,
    showDailyHome,
    showNoChallengesHome,
  ]);

  useEffect(() => {
    const tick = () => {
      const secondsLeft = secondsUntilLocalMidnight(new Date());
      setCountdownText(formatHMS(secondsLeft));
    };
    tick();
    const t = window.setInterval(tick, 250);
    return () => window.clearInterval(t);
  }, []);

  useEffect(() => {
    setShowResultsDetail(false);
  }, [challengeIdsKey]);

  useEffect(() => {
    const needHero =
      showNoChallengesHome || (showSummary && !showResultsDetail && total > 0);
    if (!needHero) return;
    const tick = () =>
      setEasternHeroSeconds(secondsUntilEasternMidnight(new Date()));
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [showNoChallengesHome, showSummary, showResultsDetail, total]);

  useEffect(() => {
    if (!showDailyHome) {
      setLeaderPreview([]);
      return;
    }
    const ids = challengeIdsKey.split(",").filter(Boolean);
    if (!ids.length) {
      setLeaderPreview([]);
      return;
    }
    let cancelled = false;
    void (async () => {
      const { data, error } = await supabase()
        .from("results")
        .select("user_id, attempts_used, solved")
        .in("challenge_id", ids);
      if (cancelled) return;
      if (error || !data?.length) {
        setLeaderPreview([]);
        return;
      }
      const agg = new Map<string, { attempts: number; solved: number }>();
      for (const r of data as Array<{
        user_id: string;
        attempts_used: number | null;
        solved: boolean | null;
      }>) {
        const o = agg.get(r.user_id) ?? { attempts: 0, solved: 0 };
        o.attempts += Math.max(0, Math.floor(Number(r.attempts_used) || 0));
        o.solved += r.solved === true ? 1 : 0;
        agg.set(r.user_id, o);
      }
      const sorted = [...agg.entries()].sort(
        (a, b) =>
          a[1].attempts - b[1].attempts || b[1].solved - a[1].solved
      );
      const top = sorted.slice(0, 3);
      const uids = top.map((t) => t[0]);
      const { data: profs } = await supabase()
        .from("profiles")
        .select("id, username")
        .in("id", uids);
      if (cancelled) return;
      const uname = new Map(
        (profs ?? []).map((p: { id: string; username: string | null }) => [
          p.id,
          p.username,
        ])
      );
      setLeaderPreview(
        top.map(([uid, v], i) => ({
          rank: i + 1,
          userId: uid,
          username: (uname.get(uid) as string | null | undefined) ?? null,
          totalAttempts: v.attempts,
        }))
      );
    })();
    return () => {
      cancelled = true;
    };
  }, [showDailyHome, challengeIdsKey]);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  useEffect(() => {
    // If an uploaded image exists, we don't need (and don't mount) the canvas.
    if (currentChallenge?.image_url) return;
    if (!canvasRef.current || !currentChallenge) return;
    const seed = canvasSeedForChallenge(currentChallenge);
    drawProcedural(canvasRef.current, seed);
    const onResize = () => {
      if (!canvasRef.current) return;
      drawProcedural(canvasRef.current, seed);
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [currentChallenge?.id, currentChallenge?.image_url]);

  /** Fade out challenge visuals for 200ms, swap challenge or open summary, then fade in. */
  const advanceAfterTransitionOut = useCallback((isLast: boolean) => {
    if (fadeTimeoutRef.current != null) {
      window.clearTimeout(fadeTimeoutRef.current);
      fadeTimeoutRef.current = null;
    }
    if (revealTimeoutRef.current != null) {
      window.clearTimeout(revealTimeoutRef.current);
      revealTimeoutRef.current = null;
    }

    setChallengeTransitioning(true);
    fadeTimeoutRef.current = window.setTimeout(() => {
      fadeTimeoutRef.current = null;
      setPendingAutoAdvance(false);
      if (isLast) {
        setShowResultsDetail(false);
        setShowSummary(true);
      } else {
        setCurrentChallengeIndex((x) => x + 1);
        setGuessInput("");
      }
      revealTimeoutRef.current = window.setTimeout(() => {
        revealTimeoutRef.current = null;
        setChallengeTransitioning(false);
      }, 0);
    }, 200);
  }, []);

  const advanceNow = useCallback(
    (isLast: boolean) => {
      if (autoAdvanceTimeoutRef.current != null) {
        window.clearTimeout(autoAdvanceTimeoutRef.current);
        autoAdvanceTimeoutRef.current = null;
      }
      setPendingAutoAdvance(false);
      setPendingFailedAutoAdvance(false);
      advanceAfterTransitionOut(isLast);
    },
    [advanceAfterTransitionOut]
  );

  useEffect(() => {
    if (!failedWithMaxGuesses || showSummary) return;
    if (autoAdvanceTimeoutRef.current != null) {
      window.clearTimeout(autoAdvanceTimeoutRef.current);
      autoAdvanceTimeoutRef.current = null;
    }
    setPendingFailedAutoAdvance(true);
    const isLast = currentChallengeIndex >= total - 1;
    autoAdvanceTimeoutRef.current = window.setTimeout(() => {
      autoAdvanceTimeoutRef.current = null;
      setPendingFailedAutoAdvance(false);
      advanceAfterTransitionOut(isLast);
    }, 2000);

    return () => {
      if (autoAdvanceTimeoutRef.current != null) {
        window.clearTimeout(autoAdvanceTimeoutRef.current);
        autoAdvanceTimeoutRef.current = null;
      }
      setPendingFailedAutoAdvance(false);
    };
  }, [
    failedWithMaxGuesses,
    showSummary,
    currentChallengeIndex,
    total,
    advanceAfterTransitionOut,
  ]);

  const submitGuess = useCallback(async () => {
    if (!roundActive || typeof guessInput !== "number" || !currentAnswer) return;
    if (!userId || !signedIn || !currentChallenge?.id) return;

    const idx = currentChallengeIndex;
    const g = guessesByIndex[idx] ?? [];

    const v = Math.max(0, Math.floor(guessInput));
    const { verdict, direction, closeness } = verdictForGuess(v, currentAnswer);
    const attemptNumber = g.length + 1;
    const nextRow: GuessRow = { value: v, verdict, direction, closeness };

    const { error } = await supabase().from("guesses").insert({
      user_id: userId,
      challenge_id: currentChallenge.id,
      guess: v,
      attempt_number: attemptNumber,
      is_correct: verdict === "correct",
    });

    if (error) return;

    applyGuessFeedback(verdict);

    posthog?.capture("guess_submitted", {
      guess_number: attemptNumber,
      is_correct: verdict === "correct",
      attempts_used: attemptNumber,
      challenge_id: currentChallenge.id,
    });

    if (
      (verdict === "correct" || attemptNumber >= MAX_GUESSES) &&
      !completedChallengeIdsRef.current.has(currentChallenge.id)
    ) {
      completedChallengeIdsRef.current.add(currentChallenge.id);
      posthog?.capture("challenge_completed", {
        solved: verdict === "correct",
        attempts_used: attemptNumber,
        challenge_id: currentChallenge.id,
      });
    }

    const finishedNext = [...g, nextRow];
    if (isChallengeFinished(currentAnswer, finishedNext)) {
      void persistChallengeResult({
        challengeId: currentChallenge.id,
        guesses: finishedNext,
        layerCount: currentAnswer,
        position:
          typeof currentChallenge.position === "number"
            ? currentChallenge.position
            : undefined,
        fallbackIndex: idx,
      });
    }

    setGuessesByIndex((prev) => {
      const next = prev.map((arr, i) =>
        i === idx ? [...arr, nextRow].slice(0, MAX_GUESSES) : arr
      );
      return next;
    });
    setGuessInput("");
    if (imageFeedbackTimeoutRef.current != null) {
      window.clearTimeout(imageFeedbackTimeoutRef.current);
      imageFeedbackTimeoutRef.current = null;
    }
    const feedbackClass =
      verdict === "correct"
        ? "challenge-image-feedback-correct"
        : verdict === "close"
          ? "challenge-image-feedback-close"
          : "challenge-image-feedback-wrong";
    setImageFeedbackClassName(feedbackClass);
    imageFeedbackTimeoutRef.current = window.setTimeout(() => {
      setImageFeedbackClassName("");
      imageFeedbackTimeoutRef.current = null;
    }, 320);

    if (verdict === "correct") {
      const burstId = Date.now() + Math.floor(Math.random() * 1_000_000);
      setConfettiBursts((prev) => [...prev, burstId]);
      const confettiTimeout = window.setTimeout(() => {
        setConfettiBursts((prev) => prev.filter((id) => id !== burstId));
      }, 900);
      confettiTimeoutsRef.current.push(confettiTimeout);
      if (autoAdvanceTimeoutRef.current != null) {
        window.clearTimeout(autoAdvanceTimeoutRef.current);
      }
      setPendingAutoAdvance(true);
      const listLength = challengesRef.current.length;
      autoAdvanceTimeoutRef.current = window.setTimeout(() => {
        autoAdvanceTimeoutRef.current = null;
        const isLast = idx >= listLength - 1;
        advanceAfterTransitionOut(isLast);
      }, 750);
    }
  }, [
    advanceAfterTransitionOut,
    roundActive,
    signedIn,
    guessInput,
    currentAnswer,
    userId,
    currentChallenge,
    currentChallengeIndex,
    guessesByIndex,
    posthog,
    persistChallengeResult,
  ]);

  const vibrateKeyTap = useCallback(() => {
    if (typeof navigator === "undefined" || typeof navigator.vibrate !== "function") {
      return;
    }
    try {
      navigator.vibrate(8);
    } catch {
      /* ignore */
    }
  }, []);

  const appendGuessDigit = useCallback(
    (digit: number) => {
      if (!roundActive) return;
      vibrateKeyTap();
      playDialPadTone(String(Math.max(0, Math.min(9, Math.floor(digit)))));
      const safeDigit = Math.max(0, Math.min(9, Math.floor(digit)));
      const current = typeof guessInput === "number" ? String(Math.max(0, Math.floor(guessInput))) : "";
      const nextRaw = `${current}${safeDigit}`.slice(0, 4);
      const next = nextRaw.replace(/^0+(?=\d)/, "");
      setGuessInput(next.length ? Number(next) : 0);
    },
    [guessInput, roundActive, vibrateKeyTap]
  );

  const backspaceGuessDigit = useCallback(() => {
    if (!roundActive) return;
    vibrateKeyTap();
    playDialPadTone("delete");
    const current = typeof guessInput === "number" ? String(Math.max(0, Math.floor(guessInput))) : "";
    if (!current.length) return;
    const next = current.slice(0, -1);
    setGuessInput(next.length ? Number(next) : "");
  }, [guessInput, roundActive, vibrateKeyTap]);

  const submitGuessFromPad = useCallback(() => {
    if (!canSubmitGuess || typeof guessInput !== "number") return;
    vibrateKeyTap();
    playDialPadTone("submit");
    void submitGuess();
  }, [canSubmitGuess, guessInput, submitGuess, vibrateKeyTap]);

  const shareChallengeImage = useCallback(async (ch: Challenge) => {
    if (!ch.image_url) return;
    if (shareBusyId === ch.id) return;
    setShareBusyId(ch.id);
    try {
      const response = await fetch(ch.image_url);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const blob = await response.blob();
      const safeTitle = (ch.title ?? "challenge")
        .replace(/\s+/g, "-")
        .replace(/[^a-z0-9-_]/gi, "")
        .toLowerCase();
      const filename = `${safeTitle || "challenge"}.png`;
      const shareTitle = ch.title?.trim() || "Challenge";
      const imageFile = new File([blob], filename, { type: "image/png" });

      if (
        typeof navigator.share === "function" &&
        typeof navigator.canShare === "function" &&
        navigator.canShare({ files: [imageFile] })
      ) {
        await navigator.share({
          files: [imageFile],
          title: `Layers — ${shareTitle}`,
          text: "Can you guess how many layers this design has? Play Layers daily 🎨",
          url: "https://layersgame.com",
        });
      } else if (typeof navigator.share === "function") {
        await navigator.share({
          title: `Layers — ${shareTitle}`,
          text: "Can you guess how many layers this design has? Play Layers daily 🎨",
          url: "https://layersgame.com",
        });
      } else {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }
    } catch (e) {
      console.error("[shareChallengeImage] failed", e);
    } finally {
      setShareBusyId(null);
    }
  }, [shareBusyId]);

  const shareDaily = useCallback(async () => {
    if (!challenges.length) return;
    posthog?.capture("share_clicked");
    const dn = dayNumber ?? "—";
    const gridLines = guessesByIndex.map((guesses) =>
      guesses.map((g) => emojiForVerdict(g.verdict)).join("") || "—",
    );
    const solvedCount = guessesByIndex.filter((g) =>
      g.some((x) => x.verdict === "correct"),
    ).length;
    const resultLine = `${solvedCount}/${challenges.length} solved`;
    const shareUrl = SITE_SHARE_URL;
    const shareText = [
      `layers #${dn}`,
      "",
      ...gridLines,
      "",
      resultLine,
      shareUrl,
    ].join("\n");

    const sharePayload = {
      title: "Layers",
      text: shareText,
      url: shareUrl,
    };

    try {
      if (
        typeof navigator !== "undefined" &&
        typeof navigator.share === "function" &&
        (!navigator.canShare || navigator.canShare(sharePayload))
      ) {
        await navigator.share(sharePayload);
        setShareFeedback("shared");
        window.setTimeout(() => setShareFeedback("idle"), 2000);
        return;
      }
    } catch (e) {
      if ((e as Error)?.name === "AbortError") return;
      console.error("[shareDaily] navigator.share", e);
    }

    try {
      await navigator.clipboard.writeText(shareText);
      setShareFeedback("copied");
      window.setTimeout(() => setShareFeedback("idle"), 2000);
    } catch {
      /* ignore */
    }
  }, [challenges, dayNumber, guessesByIndex, posthog]);

  const isLastChallenge = currentChallengeIndex >= total - 1;

  const challengeVisualFadeClassName = mounted
    ? `transition-opacity duration-200 [transition-timing-function:var(--smooth)] ${
        challengeTransitioning
          ? "pointer-events-none opacity-0"
          : "opacity-100"
      }`
    : "";

  const handleInputFocus = useCallback(() => {
    window.setTimeout(() => {
      guessInputRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    }, 120);
  }, []);

  const openImageModal = useCallback((url: string) => {
    setModalImageUrl(url);
    setModalScale(1);
    setModalOffset({ x: 0, y: 0 });
    setModalPullDy(0);
    setModalPullDragging(false);
    setModalPullTransition(null);
    setModalBackdropOpacity(MODAL_SCRIM_MAX_OPACITY);
    modalPullStartYRef.current = null;
  }, []);

  const clampScale = useCallback((value: number) => {
    return Math.max(1, Math.min(4, value));
  }, []);

  const distanceBetweenTouches = useCallback((touches: React.TouchList) => {
    if (touches.length < 2) return 0;
    const dx = touches[0].clientX - touches[1].clientX;
    const dy = touches[0].clientY - touches[1].clientY;
    return Math.hypot(dx, dy);
  }, []);

  const MODAL_DISMISS_THRESHOLD_PX = 80;
  const MODAL_BACKDROP_FADE_DISTANCE = 300;

  const MODAL_IMG_TRANSITION_SPRING_BACK =
    "transform 0.25s cubic-bezier(0.4, 0, 0.2, 1)";
  const MODAL_IMG_TRANSITION_DISMISS =
    "transform 0.2s cubic-bezier(0.4, 0, 1, 1)";
  const MODAL_BACKDROP_TRANSITION_SPRING_BACK =
    "opacity 0.25s cubic-bezier(0.4, 0, 0.2, 1)";
  const MODAL_BACKDROP_TRANSITION_DISMISS =
    "opacity 0.2s cubic-bezier(0.4, 0, 1, 1)";

  const resetModalImageViewer = useCallback(() => {
    setModalImageUrl(null);
    setModalScale(1);
    setModalOffset({ x: 0, y: 0 });
    setModalPullDy(0);
    modalPullStartYRef.current = null;
    setModalPullDragging(false);
    setModalPullTransition(null);
    setModalBackdropOpacity(MODAL_SCRIM_MAX_OPACITY);
    modalPullDyRef.current = 0;
  }, []);

  const beginModalPullGesture = useCallback((clientY: number) => {
    if (modalScaleRef.current > 1) return;
    modalPullStartYRef.current = clientY;
    setModalPullDragging(true);
    setModalPullTransition(null);
  }, []);

  const moveModalPullGesture = useCallback((clientY: number) => {
    if (modalScaleRef.current > 1 || modalPullStartYRef.current == null) return;
    const dy = clientY - modalPullStartYRef.current;
    modalPullDyRef.current = dy;
    setModalPullDy(dy);
    const dist = Math.abs(dy);
    setModalBackdropOpacity(
      MODAL_SCRIM_MAX_OPACITY *
        (1 - Math.min(1, dist / MODAL_BACKDROP_FADE_DISTANCE)),
    );
  }, []);

  const endModalPullGesture = useCallback(() => {
    if (modalScaleRef.current > 1) {
      modalPullStartYRef.current = null;
      setModalPullDragging(false);
      return;
    }
    const dy = modalPullDyRef.current;
    modalPullStartYRef.current = null;
    setModalPullDragging(false);
    const h = typeof window !== "undefined" ? window.innerHeight : 800;
    if (Math.abs(dy) > MODAL_DISMISS_THRESHOLD_PX) {
      const exitY = dy > 0 ? h : -h;
      setModalPullTransition("dismiss");
      modalPullDyRef.current = exitY;
      setModalPullDy(exitY);
      setModalBackdropOpacity(0);
      window.setTimeout(() => {
        resetModalImageViewer();
      }, 210);
    } else {
      setModalPullTransition("spring");
      modalPullDyRef.current = 0;
      setModalPullDy(0);
      setModalBackdropOpacity(MODAL_SCRIM_MAX_OPACITY);
      window.setTimeout(() => {
        setModalPullTransition(null);
      }, 260);
    }
  }, [resetModalImageViewer]);

  const modalBackdropCssTransition = useMemo(() => {
    if (modalPullDragging) return "none";
    if (modalPullTransition === "spring") return MODAL_BACKDROP_TRANSITION_SPRING_BACK;
    if (modalPullTransition === "dismiss") return MODAL_BACKDROP_TRANSITION_DISMISS;
    return "none";
  }, [modalPullDragging, modalPullTransition]);

  const modalImgCssTransition = useMemo(() => {
    if (modalScale > 1) return "none";
    if (modalPullDragging) return "none";
    if (modalPullTransition === "spring") return MODAL_IMG_TRANSITION_SPRING_BACK;
    if (modalPullTransition === "dismiss") return MODAL_IMG_TRANSITION_DISMISS;
    return "none";
  }, [modalPullDragging, modalPullTransition, modalScale]);

  useEffect(() => {
    if (!modalImageUrl) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        resetModalImageViewer();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [modalImageUrl, resetModalImageViewer]);

  useEffect(() => {
    if (!modalImageUrl) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [modalImageUrl]);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const onHomeRetap = () => {
      void refreshTodayChallenges();
    };
    window.addEventListener("layers:home-retap-refresh", onHomeRetap);
    return () => {
      window.removeEventListener("layers:home-retap-refresh", onHomeRetap);
    };
  }, [refreshTodayChallenges]);

  return (
    <AppSiteChrome
      title="Layers"
      right={
        typeof dayNumber === "number" && dayNumber > 0 ? (
          <div className="rounded-full border border-[rgba(124,58,237,0.35)] bg-[rgba(124,58,237,0.1)] px-3 py-1.5 text-xs font-bold tabular-nums text-white shadow-sm">
            Daily #{dayNumber}
          </div>
        ) : undefined
      }
      belowHeader={
        <>
          {total > 0 && !showSummary && gameDataReady && !compactGameplayMode ? (
            <div className="flex shrink-0 items-center justify-center px-4 pb-2 pt-1 md:px-5">
              <div className="rounded-full border border-[rgba(124,58,237,0.35)] bg-[rgba(124,58,237,0.1)] px-4 py-2 text-sm font-semibold text-[var(--text)] shadow-sm">
                <span className="text-white/70">Next challenge </span>
                <span className="font-mono text-base font-bold text-[var(--text)]">
                  {countdownText ?? "--:--:--"}
                </span>
              </div>
            </div>
          ) : null}
        </>
      }
      className="h-dvh min-h-0 min-w-0 overflow-x-hidden overflow-y-hidden"
    >
      <div
        className="relative flex min-h-0 flex-1 flex-col"
        style={
          profilePreviewHandle != null
            ? ({ touchAction: "none" } as React.CSSProperties)
            : undefined
        }
      >
        <PullToRefresh
          disabled={Boolean(modalImageUrl) || profilePreviewHandle != null}
          className={`mx-auto flex w-full min-w-0 max-w-3xl flex-1 flex-col px-4 md:px-5 ${
            showNoChallengesHome
              ? "bg-[#0f0520]"
              : showDailyHome
                ? "bg-[radial-gradient(120%_80%_at_50%_-20%,rgba(124,58,237,0.35),transparent_55%),linear-gradient(180deg,#1e0b3a_0%,#0f0520_45%,#06020f_100%)]"
              : ""
          }`}
          scrollAreaClassName={compactGameplayMode ? "overflow-y-hidden" : ""}
          contentClassName={
            compactGameplayMode ? "flex h-full min-h-full min-w-0 flex-col" : ""
          }
          onRefresh={refreshTodayChallenges}
        >
        <div
          className={
            compactGameplayMode
              ? "flex min-h-0 min-w-0 flex-1 flex-col pb-0"
              : "pb-[120px]"
          }
        >
        {!gameDataReady && challenges.length > 0 ? (
          <HomeGameSkeleton />
        ) : showNoChallengesHome ? (
          <div className="flex min-h-full flex-1 flex-col items-center py-10 text-center">
            <div className="mb-3 inline-flex items-center justify-center rounded-md bg-[#7c3aed22] px-3 py-1 text-xs font-semibold text-[#a855f7]">
              Back tomorrow
            </div>
            <img
              src={APP_LOGO_INGAME_SRC}
              alt="Layers"
              className="h-14 w-auto max-w-[min(280px,85vw)] object-contain drop-shadow-[0_0_40px_rgba(124,58,237,0.45)]"
            />
            <p className="mt-3.5 text-[22px] font-bold tracking-[-0.3px] text-white/90">
              You&apos;re all caught up
            </p>
            <p className="mb-5 mt-3 max-w-[260px] text-center text-[14px] leading-[1.55] text-[#a0a0b0]">
              Today&apos;s challenges drop at midnight EST. Come back tomorrow for 5
              new designs.
            </p>
            <div className="w-full max-w-xs rounded-2xl border border-white/10 bg-black/25 px-4 py-[14px] backdrop-blur-sm">
              <div className="text-xs font-bold uppercase tracking-[0.2em] text-white/40">
                Next drop in
              </div>
              <div className="mt-2 font-mono text-[38px] font-bold tracking-[0.04em] [font-variant-numeric:tabular-nums] text-white">
                {formatHMS(easternHeroSeconds)}
              </div>
              <p className="mt-3 text-sm text-white/50">
                Resets automatically
              </p>
            </div>
            <div className="mt-3.5 flex w-full max-w-xs flex-col gap-2">
              <Link
                href="/leaderboard"
                className="inline-flex min-h-[48px] items-center justify-center rounded-[14px] p-[14px] text-[15px] font-semibold bg-[var(--accent)] text-white shadow-lg shadow-violet-500/20 transition hover:bg-[var(--accent2)]"
              >
                View Leaderboard
              </Link>
              <button
                type="button"
                onClick={() => void shareLayersInvite()}
                className="inline-flex min-h-[48px] items-center justify-center rounded-[14px] border border-white/20 bg-transparent p-[14px] text-[15px] font-semibold text-white/90 transition hover:bg-white/10"
              >
                Share Layers with a designer
              </button>
            </div>
          </div>
        ) : showDailyHome ? (
          <div className="flex flex-1 flex-col items-center pb-10 pt-8 text-center">
            <img
              src={APP_LOGO_INGAME_SRC}
              alt="Layers"
              className="h-14 w-auto max-w-[min(280px,85vw)] object-contain drop-shadow-[0_0_48px_rgba(139,92,246,0.5)]"
            />
            <p className="mt-6 text-lg font-bold text-emerald-300">
              Daily Complete <span className="inline-block">✓</span>
            </p>
            <p className="mt-1 text-sm text-white/55">{formatFriendlyEasternToday()}</p>

            <div className="mt-10 w-full max-w-sm rounded-3xl border border-[rgba(167,139,250,0.35)] bg-black/20 px-6 py-8 shadow-[0_0_60px_rgba(88,28,135,0.25)] backdrop-blur-md">
              <div className="text-[11px] font-normal text-[#a0a0b0]">
                Next challenges in
              </div>
              <div className="mt-3 font-mono text-5xl font-bold tabular-nums tracking-tight text-white md:text-6xl">
                {formatHMS(easternHeroSeconds)}
              </div>
            </div>

            <div className="mt-10 w-full max-w-md rounded-2xl border border-white/10 bg-white/[0.06] px-4 py-4">
              <div className="text-[11px] font-normal text-[#a0a0b0]">
                Today&apos;s score
              </div>
              <div className="mt-2 text-2xl font-extrabold text-white">
                {solvedTodayCount}{" "}
                <span className="text-lg font-semibold text-white/50">/ {total}</span>{" "}
                <span className="text-base font-medium text-white/40">solved</span>
              </div>
              <div className="mt-4 flex flex-wrap justify-center gap-2">
                {challenges.map((ch, i) => {
                  const g = guessesByIndex[i] ?? [];
                  const solved = g.some((x) => x.verdict === "correct");
                  return (
                    <div
                      key={ch.id}
                      className="min-w-[4.5rem] rounded-xl border border-white/10 bg-black/30 px-2 py-2"
                    >
                      <div className="text-[10px] font-semibold uppercase tracking-wider text-white/40">
                        #{i + 1}
                      </div>
                      <div className="mt-1 flex items-center justify-center gap-[3px]">
                        {g.length === 0 ? (
                          <span className="text-base text-white/35">—</span>
                        ) : (
                          g.map((x, idx) => {
                            const pipColor =
                              x.verdict === "correct"
                                ? "#22c55e"
                                : x.verdict === "close"
                                  ? "#f59e0b"
                                  : "#ef4444";
                            return (
                              <span
                                key={`${ch.id}-summary-pip-${idx}`}
                                className="inline-block h-[18px] w-[18px] rounded-[4px]"
                                style={{ backgroundColor: pipColor }}
                                aria-hidden
                              />
                            );
                          })
                        )}
                      </div>
                      <div
                        className={`mt-1 text-xs font-bold ${solved ? "text-emerald-400" : "text-white/35"}`}
                      >
                        {solved ? "Solved" : "—"}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="mt-8 flex w-full max-w-md flex-col gap-3 sm:flex-row sm:justify-center">
              <button
                type="button"
                onClick={() => setShowResultsDetail(true)}
                className="inline-flex min-h-[48px] items-center justify-center rounded-2xl bg-[#7c3aed] px-6 text-sm font-bold text-white shadow-lg shadow-violet-500/20 transition hover:bg-[#6d28d9]"
              >
                View Results
              </button>
              <button
                type="button"
                onClick={() => void shareDaily()}
                className="inline-flex min-h-[48px] items-center justify-center rounded-2xl border-2 border-white/25 bg-transparent px-6 text-sm font-bold text-white transition hover:bg-white/10"
              >
                {shareFeedback === "copied"
                  ? "Copied!"
                  : shareFeedback === "shared"
                    ? "Shared!"
                    : "Share"}
              </button>
            </div>

            <div className="mt-12 w-full max-w-md text-left min-w-0">
              <div className="mb-3">
                <Link
                  href="/leaderboard"
                  className="inline-flex min-h-[44px] items-center text-xs font-medium text-[#a0a0b0] transition-opacity hover:opacity-90 active:opacity-80"
                >
                  Leaderboard
                </Link>
                <p className="mt-0.5 text-xs text-white/45">
                  {formatLeaderboardPreviewDateEastern()}
                </p>
              </div>
              <div className="overflow-hidden rounded-[var(--radius-card)] border border-white/10 bg-black/25">
                {leaderPreview.length === 0 ? (
                  <p className="px-4 py-6 text-center text-sm text-white/55">
                    No scores yet — be the first on the board.
                  </p>
                ) : (
                  <ul className="divide-y divide-white/5">
                    {leaderPreview.map((row) => (
                      <li
                        key={row.userId}
                        className="flex items-center gap-3 px-4 py-3 text-sm"
                      >
                        <span className="w-8 font-mono font-bold text-white/50">
                          {row.rank}
                        </span>
                        <span className="min-w-0 flex-1 font-semibold text-white">
                          <ProfileUsernameLink
                            username={row.username}
                            fallbackDisplay={shortUserIdLabel(row.userId)}
                          />
                        </span>
                        <span className="shrink-0 tabular-nums text-white/80">
                          {row.totalAttempts} attempts
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </div>
        ) : showSummary && showResultsDetail ? (
          <div className="mt-8 space-y-6">
            <button
              type="button"
              onClick={() => setShowResultsDetail(false)}
              className="text-sm font-normal text-[#a0a0b0] hover:underline"
            >
              ← Back
            </button>
            <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-center text-sm font-semibold text-white/80">
              Daily complete · {total} {total === 1 ? "challenge" : "challenges"}
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
              <div className="text-lg font-extrabold">Your results</div>
              <div className="mt-4 grid gap-4">
                {challenges.map((ch, i) => {
                  const g = guessesByIndex[i] ?? [];
                  const ans = ch.layer_count;
                  const solved = g.some((x) => x.verdict === "correct");
                  const emojiRow = g
                    .map((x) => emojiForVerdict(x.verdict))
                    .join("");
                  return (
                    <div
                      key={ch.id}
                      className="rounded-xl border border-white/10 bg-[rgba(26,10,46,0.6)] p-4"
                    >
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
                        {ch.image_url ? (
                          <div
                            className="relative aspect-[3/4] w-full shrink-0 overflow-hidden rounded-[12px] border border-white/10 sm:w-32"
                            style={{
                              background: "transparent",
                              backgroundColor: "transparent",
                            }}
                          >
                            <button
                              type="button"
                              aria-label="Open result image fullscreen"
                              onClick={() => {
                                if (ch.image_url) openImageModal(ch.image_url);
                              }}
                              className="h-full w-full"
                            >
                              <img
                                src={ch.image_url}
                                alt=""
                                loading={i === 0 ? "eager" : "lazy"}
                                decoding="async"
                                className="h-full w-full cursor-zoom-in object-contain"
                              />
                            </button>

                            <div className="absolute bottom-1 right-2 z-20 flex items-center gap-2">
                              <CreatorResultAvatar
                                creatorName={ch.creator_name}
                                avatarByUsername={creatorAvatars}
                              />
                            </div>
                          </div>
                        ) : null}
                        <div className="min-w-0 flex-1">
                          <div className="text-xs font-semibold uppercase tracking-wider text-white/45">
                            Challenge {i + 1}
                            {ch.position != null ? ` · #${ch.position}` : ""}
                          </div>
                          <div className="mt-1 font-semibold text-white">
                            {ch.title ?? "Untitled"}
                          </div>
                          <div className="mt-1 text-sm text-white/60">
                            Creator{" "}
                            <CreatorProfileLink raw={ch.creator_name} />
                          </div>
                          <div className="mt-2 text-sm text-white/70">
                            Answer:{" "}
                            <span className="font-bold text-white">
                              {ans ?? "—"}
                            </span>
                            {" · "}
                            {solved ? "Solved" : "Not solved"} ·{" "}
                            {`${g.length}/${MAX_GUESSES} attempts`}
                          </div>
                          {emojiRow ? (
                            <div className="mt-2 font-mono text-lg tracking-widest">
                              {emojiRow}
                            </div>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
              <button
                type="button"
                onClick={shareDaily}
                className="rounded-xl border-2 border-white bg-transparent px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-white/10"
              >
                {shareFeedback === "copied"
                  ? "Copied!"
                  : shareFeedback === "shared"
                    ? "Shared!"
                    : "Share"}
              </button>
            </div>
          </div>
        ) : compactGameplayMode ? (
          <div
            className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
            style={{ paddingBottom: "max(env(safe-area-inset-bottom), 16px)" }}
          >
            {currentChallenge ? (
              <>
                <div
                  className={`flex h-11 shrink-0 min-w-0 items-center justify-end gap-2 ${challengeVisualFadeClassName}`}
                >
                  <div className="flex shrink-0 items-center gap-2">
                    <div className="relative">
                      <button
                        ref={infoButtonRef}
                        type="button"
                        aria-expanded={infoPopoverOpen}
                        aria-haspopup="dialog"
                        aria-label="Challenge details"
                        onClick={() => setInfoPopoverOpen((o) => !o)}
                        className="flex h-9 w-9 items-center justify-center rounded-full border border-white/15 bg-white/10 text-sm font-bold text-white/90 shadow-[0_8px_24px_rgba(0,0,0,0.35)] ring-1 ring-white/10 backdrop-blur-md hover:bg-white/15 active:scale-[0.98]"
                      >
                        ⓘ
                      </button>
                      {infoPopoverOpen ? (
                        <div
                          ref={infoPopoverRef}
                          role="dialog"
                          aria-label="Challenge info"
                          className="absolute right-0 top-full z-[60] mt-2 w-[min(20rem,calc(100vw-1.5rem))] overflow-hidden rounded-2xl border border-white/15 bg-[linear-gradient(180deg,rgba(40,16,67,0.98)_0%,rgba(22,9,39,0.98)_100%)] p-3.5 text-left text-sm shadow-[0_24px_60px_rgba(0,0,0,0.52)] ring-1 ring-white/10 backdrop-blur-xl"
                        >
                          {isSponsored && sponsorName ? (
                            <p className="text-sm text-[rgba(255,255,255,0.6)]">
                              Sponsored by {sponsorName}
                            </p>
                          ) : null}
                          <div className="space-y-2">
                            <div className="flex items-start justify-between gap-3 rounded-lg bg-white/[0.04] px-3 py-2">
                              <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-white/55">
                                Creator
                              </span>
                              <span className="min-w-0 text-right text-sm text-white/90">
                                <GameplayCreatorProfileLink
                                  raw={currentChallenge.creator_name}
                                  onOpenProfile={(h) => {
                                    setInfoPopoverOpen(false);
                                    setProfilePreviewHandle(h);
                                  }}
                                />
                              </span>
                            </div>
                            <div className="flex items-start justify-between gap-3 rounded-lg bg-white/[0.04] px-3 py-2">
                              <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-white/55">
                                Software
                              </span>
                              <span className="min-w-0 text-right text-sm text-white/90">
                                {currentChallenge.software ?? "—"}
                              </span>
                            </div>
                            <div className="flex items-start justify-between gap-3 rounded-lg bg-white/[0.04] px-3 py-2">
                              <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-white/55">
                                Category
                              </span>
                              <span className="min-w-0 text-right text-sm text-white/90">
                                {currentChallenge.category ?? "—"}
                              </span>
                            </div>
                          </div>
                        </div>
                      ) : null}
                    </div>
                  </div>
                </div>

                <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-0">
                  <div
                    ref={tutorialImageRef}
                    className="relative left-1/2 mb-3 flex min-h-0 min-w-0 flex-1 items-center justify-center w-dvw -translate-x-1/2"
                  >
                    <div
                      className="mx-auto flex h-full min-h-0 w-[80%] max-w-full items-center justify-center"
                      style={{
                        background: "transparent",
                        backgroundColor: "transparent",
                      }}
                    >
                      <div
                        className={`challenge-image-frame box-border flex h-full min-h-0 max-h-full w-full cursor-zoom-in items-center justify-center rounded-none ${imageFeedbackClassName} ${challengeVisualFadeClassName}`}
                        style={{
                          background: "transparent",
                          backgroundColor: "transparent",
                        }}
                        onClick={() => {
                          if (displayChallengeImageUrl)
                            openImageModal(displayChallengeImageUrl);
                        }}
                      >
                        <div
                          className="relative flex h-full min-h-0 w-full max-w-full items-center justify-center"
                          style={{
                            background: "transparent",
                            backgroundColor: "transparent",
                          }}
                        >
                          {currentChallenge.image_url ? (
                            <AnimatePresence mode="wait" initial={false}>
                              <motion.img
                                key={currentChallenge.id}
                                src={displayChallengeImageUrl ?? ""}
                                alt={currentChallenge.title ?? "Challenge image"}
                                loading="eager"
                                decoding="async"
                                onLoad={() => setChallengeMainImageLoaded(true)}
                                initial={{ opacity: 0, scale: 0.95 }}
                                animate={{
                                  opacity: challengeMainImageLoaded ? 1 : 0,
                                  scale: 1,
                                }}
                                exit={{ opacity: 0 }}
                                transition={{
                                  duration: 0.25,
                                  ease: "easeOut",
                                }}
                                className="w-full object-contain"
                                style={{
                                  borderRadius: "14px",
                                  overflow: "hidden",
                                  display: "block",
                                  width: "100%",
                                  height: "auto",
                                  background: "transparent",
                                  backgroundColor: "transparent",
                                }}
                              />
                            </AnimatePresence>
                          ) : (
                            <canvas
                              ref={canvasRef}
                              className="block h-full w-full"
                              style={{
                                background: "transparent",
                                backgroundColor: "transparent",
                              }}
                            />
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="mt-1 text-right text-[10px] text-[#a0a0b0]">
                      tap to zoom
                    </div>
                  </div>

                  <div
                    className={`mb-2 flex min-w-0 items-start justify-between gap-3 ${challengeVisualFadeClassName}`}
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-white">
                        {currentChallenge.title ?? "Untitled"}
                      </p>
                      <p className="mt-1 text-[11px] font-mono text-white/60">
                        Challenge {currentChallengeIndex + 1} of {total}
                      </p>
                    </div>
                    <div
                      className="flex shrink-0 items-center gap-1.5"
                      role="img"
                      aria-label={`Guesses used ${currentGuesses.length} of ${MAX_GUESSES}`}
                    >
                      {Array.from({ length: MAX_GUESSES }).map((_, i) => {
                        const isUsed = i < currentGuesses.length;
                        const isActive =
                          !isUsed &&
                          i === currentGuesses.length &&
                          roundActive &&
                          currentGuesses.length < MAX_GUESSES;
                        return (
                          <span
                            key={`${currentChallenge.id}-compact-pip-${i}`}
                            className="inline-block h-[5px] w-[28px] rounded-[3px]"
                            style={{
                              backgroundColor: isActive
                                ? "#7c3aed"
                                : isUsed
                                  ? "#ef4444"
                                  : "#ffffff15",
                            }}
                          />
                        );
                      })}
                    </div>
                  </div>

                  <div className="flex w-full shrink-0 flex-col px-1">
                    <div className="mt-0 mb-3 flex items-center justify-center rounded-[10px] border-[0.5px] border-[rgba(124,58,237,0.2)] bg-[#1a0a2e] px-4 py-[10px] text-center">
                      <span
                        className="font-mono text-[22px] font-bold leading-none tracking-[0.06em]"
                        style={{
                          color:
                            typeof guessInput === "number"
                              ? "#f8f4ff"
                              : "rgba(255,255,255,0.13)",
                        }}
                      >
                        {typeof guessInput === "number" ? guessInput : "—"}
                      </span>
                    </div>

                    <div className="grid h-[180px] min-h-[180px] shrink-0 grid-cols-3 gap-[4px]">
                  {currentFinished ? (
                    <div className="col-span-3 row-span-4 flex min-h-0 flex-col items-center justify-center gap-3 rounded-[var(--radius-card)] border border-white/10 bg-[rgba(26,10,46,0.6)] p-3 text-center">
                      <div className="text-xs font-semibold uppercase tracking-wider text-white/70">
                        {solvedWithCorrect ? "Correct" : "Answer"}
                      </div>
                      <div className="font-mono text-4xl font-extrabold tracking-tight text-white">
                        {currentAnswer ?? "—"}
                      </div>
                      {pendingAutoAdvance ? (
                        <p className="text-sm font-semibold text-[var(--success)]">
                          Continuing…
                        </p>
                      ) : (
                        <button
                          type="button"
                          disabled={challengeTransitioning}
                          onClick={() => advanceAfterTransitionOut(isLastChallenge)}
                          className="inline-flex min-h-[48px] items-center justify-center rounded-[var(--radius-pill)] bg-[var(--accent)] px-5 text-sm font-bold text-white shadow-sm transition-colors hover:bg-[var(--accent2)] disabled:opacity-40"
                        >
                          {isLastChallenge ? "View daily summary" : "Next challenge"}
                        </button>
                      )}
                    </div>
                  ) : (
                    <>
                      {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((digit) => (
                        <button
                          key={`digit-${digit}`}
                          type="button"
                          onClick={() => appendGuessDigit(digit)}
                          disabled={!roundActive}
                          className="tap-press rounded-[9px] border-[0.5px] border-[rgba(255,255,255,0.07)] bg-[#1a0a2e] px-0 py-[9px] text-[16px] font-medium text-[#f8f4ff] shadow-sm transition-[transform,background-color,filter] duration-150 [transition-timing-function:var(--spring)] active:scale-[0.92] hover:bg-[#24103f] disabled:opacity-35"
                        >
                          {digit}
                        </button>
                      ))}
                      <button
                        type="button"
                        onClick={backspaceGuessDigit}
                        disabled={!roundActive || typeof guessInput !== "number"}
                        className="tap-press flex items-center justify-center rounded-[9px] border-[0.5px] border-[rgba(255,255,255,0.07)] bg-[#1a0a2e] px-0 py-[9px] text-[11px] text-[#a0a0b0] shadow-sm transition-[transform,background-color,filter] duration-150 [transition-timing-function:var(--spring)] active:scale-[0.92] hover:bg-[#24103f] disabled:opacity-35"
                        aria-label="Delete"
                      >
                        <svg
                          width="28"
                          height="28"
                          viewBox="0 0 24 24"
                          fill="none"
                          aria-hidden="true"
                        >
                          <path
                            d="M21 5H9.5a2 2 0 0 0-1.4.58L3 10.67a2 2 0 0 0 0 2.83l5.1 5.09a2 2 0 0 0 1.4.58H21a1 1 0 0 0 1-1V6a1 1 0 0 0-1-1Z"
                            stroke="currentColor"
                            strokeWidth="1.8"
                            strokeLinejoin="round"
                          />
                          <path
                            d="m15.5 9.5-5 5m0-5 5 5"
                            stroke="currentColor"
                            strokeWidth="1.8"
                            strokeLinecap="round"
                          />
                        </svg>
                      </button>
                      <button
                        type="button"
                        onClick={() => appendGuessDigit(0)}
                        disabled={!roundActive}
                        className="tap-press rounded-[9px] border-[0.5px] border-[rgba(255,255,255,0.07)] bg-[#1a0a2e] px-0 py-[9px] text-[16px] font-medium text-[#f8f4ff] shadow-sm transition-[transform,background-color,filter] duration-150 [transition-timing-function:var(--spring)] active:scale-[0.92] hover:bg-[#24103f] disabled:opacity-35"
                      >
                        0
                      </button>
                      <button
                        type="button"
                        onClick={submitGuessFromPad}
                        disabled={!canSubmitGuess || typeof guessInput !== "number"}
                        className="tap-press rounded-[9px] border-[0.5px] border-[#10b981] bg-[#10b981] px-0 py-[9px] text-[16px] font-medium text-white shadow-sm transition-[transform,filter,background-color,color,border-color] duration-150 [transition-timing-function:var(--spring)] active:scale-[0.92] hover:brightness-110 disabled:border-[#1a3a2e] disabled:bg-[#1a3a2e] disabled:text-[rgba(255,255,255,0.13)] disabled:opacity-100"
                      >
                        ✓
                      </button>
                    </>
                  )}
                  </div>
                </div>
                </div>
              </>
            ) : null}
          </div>
        ) : (
          <>
            <div className="mt-3 flex min-h-0 min-w-0 flex-1 flex-col gap-2">
              {currentChallenge && (
                <>
                  <div
                    ref={tutorialImageRef}
                    className="relative mb-4 w-full max-w-full"
                  >
                    <div
                      className="mx-auto w-[80%] max-w-full"
                      style={{
                        background: "transparent",
                        backgroundColor: "transparent",
                      }}
                    >
                    {/* Border + feedback animation live on outer (overflow visible) so red/green
                        strokes are not clipped; inner clips only the bitmap to rounded rect. */}
                    <div
                      className={`challenge-image-frame box-border flex max-h-[54vh] w-full max-w-full cursor-zoom-in items-center justify-center rounded-[var(--radius-card)] ${imageFeedbackClassName} ${challengeVisualFadeClassName}`}
                      style={{
                        background: "transparent",
                        backgroundColor: "transparent",
                      }}
                      onClick={() => {
                        if (displayChallengeImageUrl) {
                          openImageModal(displayChallengeImageUrl);
                        }
                      }}
                    >
                      <div
                        className="relative max-h-[54vh] w-full max-w-full"
                        style={{
                          background: "transparent",
                          backgroundColor: "transparent",
                        }}
                      >
                        {currentChallenge.image_url ? (
                          <AnimatePresence mode="wait" initial={false}>
                            <motion.img
                              key={currentChallenge.id}
                              src={displayChallengeImageUrl ?? ""}
                              alt={currentChallenge.title ?? "Challenge image"}
                              loading="eager"
                              decoding="async"
                              onLoad={() => setChallengeMainImageLoaded(true)}
                              initial={{ opacity: 0, scale: 0.95 }}
                              animate={{
                                opacity: challengeMainImageLoaded ? 1 : 0,
                                scale: 1,
                              }}
                              exit={{ opacity: 0 }}
                              transition={{
                                duration: 0.25,
                                ease: "easeOut",
                              }}
                              className="max-h-[54vh] w-full max-w-full cursor-zoom-in object-contain"
                              style={{
                                borderRadius: "14px",
                                overflow: "hidden",
                                display: "block",
                                width: "100%",
                                height: "auto",
                                background: "transparent",
                                backgroundColor: "transparent",
                              }}
                            />
                          </AnimatePresence>
                        ) : (
                          <canvas
                            ref={canvasRef}
                            className="block h-[54vh] w-full max-w-full"
                            style={{
                              background: "transparent",
                              backgroundColor: "transparent",
                            }}
                          />
                        )}
                      </div>
                    </div>
                    <div className="mt-1 text-right text-[10px] text-[#a0a0b0]">
                      tap to zoom
                    </div>
                    </div>
                  </div>

                  <div
                    className={`relative flex min-w-0 items-start justify-between gap-3 ${challengeVisualFadeClassName}`}
                  >
                    <div className="min-w-0">
                      <h2 className="text-base font-semibold leading-snug">
                        {currentChallenge.title ?? "Untitled"}
                      </h2>
                      {isSponsored ? (
                        <p className="mt-0.5 text-[11px] text-[rgba(255,255,255,0.4)]">Sponsored</p>
                      ) : null}
                      <p className="mt-1 text-sm font-mono text-white/60">
                        Challenge {currentChallengeIndex + 1} of {total}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2 pt-0.5">
                      <div
                        className="flex items-center gap-1.5"
                        role="img"
                        aria-label={`Guesses used ${currentGuesses.length} of ${MAX_GUESSES}`}
                      >
                        {Array.from({ length: MAX_GUESSES }).map((_, i) => {
                          const isUsed = i < currentGuesses.length;
                          const isActive =
                            !isUsed &&
                            i === currentGuesses.length &&
                            roundActive &&
                            currentGuesses.length < MAX_GUESSES;
                          return (
                            <span
                              key={`${currentChallenge.id}-pip-${i}`}
                              className="inline-block h-[5px] w-[28px] rounded-[3px]"
                              style={{
                                backgroundColor: isActive
                                  ? "#7c3aed"
                                  : isUsed
                                    ? "#ef4444"
                                    : "#ffffff15",
                              }}
                            />
                          );
                        })}
                      </div>
                      <div className="relative">
                      <button
                        ref={infoButtonRef}
                        type="button"
                        aria-expanded={infoPopoverOpen}
                        aria-haspopup="dialog"
                        aria-label="Challenge details"
                        onClick={() => setInfoPopoverOpen((o) => !o)}
                        className="flex h-11 min-h-[44px] w-11 min-w-[44px] items-center justify-center rounded-full border border-white/15 bg-white/10 text-base font-bold leading-none text-white/90 shadow-[0_8px_24px_rgba(0,0,0,0.35)] ring-1 ring-white/10 backdrop-blur-md hover:bg-white/15 active:scale-[0.98]"
                      >
                        ⓘ
                      </button>
                      {infoPopoverOpen ? (
                        <div
                          ref={infoPopoverRef}
                          role="dialog"
                          aria-label="Challenge info"
                          className="absolute right-0 top-full z-[60] mt-2 w-[min(20rem,calc(100vw-1.5rem))] overflow-hidden rounded-2xl border border-white/15 bg-[linear-gradient(180deg,rgba(40,16,67,0.98)_0%,rgba(22,9,39,0.98)_100%)] p-3.5 text-left text-sm shadow-[0_24px_60px_rgba(0,0,0,0.52)] ring-1 ring-white/10 backdrop-blur-xl"
                        >
                          {isSponsored && sponsorName ? (
                            <p className="text-sm text-[rgba(255,255,255,0.6)]">
                              Sponsored by {sponsorName}
                            </p>
                          ) : null}
                          <div className="space-y-2">
                            <div className="flex items-start justify-between gap-3 rounded-lg bg-white/[0.04] px-3 py-2">
                              <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-white/55">
                                Creator
                              </span>
                              <span className="min-w-0 text-right text-sm text-white/90">
                                <GameplayCreatorProfileLink
                                  raw={currentChallenge.creator_name}
                                  onOpenProfile={(h) => {
                                    setInfoPopoverOpen(false);
                                    setProfilePreviewHandle(h);
                                  }}
                                />
                              </span>
                            </div>
                            <div className="flex items-start justify-between gap-3 rounded-lg bg-white/[0.04] px-3 py-2">
                              <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-white/55">
                                Software
                              </span>
                              <span className="min-w-0 text-right text-sm text-white/90">
                                {currentChallenge.software ?? "—"}
                              </span>
                            </div>
                            <div className="flex items-start justify-between gap-3 rounded-lg bg-white/[0.04] px-3 py-2">
                              <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-white/55">
                                Category
                              </span>
                              <span className="min-w-0 text-right text-sm text-white/90">
                                {currentChallenge.category ?? "—"}
                              </span>
                            </div>
                          </div>
                        </div>
                      ) : null}
                      </div>
                    </div>
                  </div>

                  <div className="flex min-w-0 flex-col gap-2">
                    {failedWithMaxGuesses ? (
                      <div className="rounded-[var(--radius-card)] border border-[rgba(16,185,129,0.3)] bg-[rgba(16,185,129,0.1)] px-4 py-3 text-center shadow-sm">
                        <div className="text-sm font-semibold text-[rgba(16,185,129,0.9)]">
                          Answer
                        </div>
                        <div className="mt-1 text-3xl font-extrabold tracking-tight text-emerald-300 md:text-4xl">
                          {currentAnswer}
                        </div>
                      </div>
                    ) : null}

                    {currentGuesses.length > 0 ? (
                      <div
                        className={`flex min-w-0 flex-nowrap items-center gap-2 overflow-x-auto overscroll-x-contain [-webkit-overflow-scrolling:touch] ${challengeVisualFadeClassName}`}
                        role="list"
                        aria-label="Guess history"
                      >
                        {currentGuesses.map((g, i) => {
                          const chipClass =
                            g.verdict === "correct"
                              ? "border-[rgba(16,185,129,0.4)] bg-[rgba(16,185,129,0.15)] text-emerald-300"
                              : g.verdict === "close"
                                ? "border-amber-400/35 bg-amber-400/15 text-amber-200"
                                : "border-[rgba(239,68,68,0.35)] bg-[rgba(239,68,68,0.15)] text-red-200";
                          const isLatest = i === currentGuesses.length - 1;
                          const guessAnim =
                            isLatest && g.verdict === "correct"
                              ? "guess-chip-anim--correct"
                              : isLatest && g.verdict === "wrong"
                                ? "guess-chip-anim--wrong"
                                : isLatest
                                  ? "guess-chip-anim"
                                  : "";
                          return (
                            <div
                              key={`${currentChallenge?.id ?? "c"}-${i}-${g.value}`}
                              role="listitem"
                              className={`flex h-9 w-9 items-center justify-center rounded-full border px-0.5 text-sm font-bold tabular-nums ${chipClass} ${guessAnim}`}
                            >
                              {g.value}
                            </div>
                          );
                        })}
                      </div>
                    ) : null}

                    {failedWithMaxGuesses ? (
                      !isLastChallenge ? (
                        <button
                          type="button"
                          disabled={challengeTransitioning}
                          onClick={() => advanceNow(false)}
                          className="min-h-[48px] w-full rounded-xl bg-[var(--accent)] px-5 py-3 text-sm font-bold text-white shadow-sm transition-colors hover:bg-[var(--accent2)] disabled:opacity-40"
                        >
                          Next →
                        </button>
                      ) : (
                        <button
                          type="button"
                          disabled={challengeTransitioning}
                          onClick={() => advanceNow(true)}
                          className="min-h-[48px] w-full rounded-xl bg-[var(--accent)] px-5 py-3 text-sm font-bold text-white shadow-sm transition-colors hover:bg-[var(--accent2)] disabled:opacity-40"
                        >
                          Next →
                        </button>
                      )
                    ) : (
                      <>
                        <div className="mb-3 flex min-w-0 flex-col gap-2 sm:flex-row sm:items-stretch sm:gap-3">
                          <input
                            ref={guessInputRef}
                            type="number"
                            inputMode="numeric"
                            min={0}
                            disabled={!roundActive}
                            value={guessInput}
                            onFocus={handleInputFocus}
                            onChange={(e) =>
                              setGuessInput(
                                e.target.value === ""
                                  ? ""
                                  : Number(e.target.value)
                              )
                            }
                            onKeyDown={(e) => {
                              if (e.key === "Enter") void submitGuess();
                            }}
                            className="box-border min-h-[48px] w-full min-w-0 rounded-full border border-white/10 bg-[var(--surface)] px-4 py-2 text-base font-semibold leading-normal text-[var(--text)] outline-none placeholder:text-white/30 focus-visible:ring-2 focus-visible:ring-[rgba(124,58,237,0.4)] disabled:opacity-40"
                            placeholder="Layer count…"
                          />
                          <button
                            type="button"
                            disabled={
                              !canSubmitGuess ||
                              typeof guessInput !== "number"
                            }
                            onClick={() => void submitGuess()}
                            className="min-h-[48px] w-full shrink-0 rounded-full bg-[var(--accent)] px-5 py-2 text-sm font-bold text-white shadow-sm transition-[background-color,transform,filter] duration-150 [transition-timing-function:var(--smooth)] hover:bg-[var(--accent2)] hover:brightness-105 disabled:opacity-40 sm:w-auto sm:min-w-[7rem]"
                          >
                            Submit
                          </button>
                        </div>

                        {!signedIn && roundActive ? (
                          <p className="text-center text-sm text-white/55">
                            Sign in to save your progress —{" "}
                            <Link
                              href="/login"
                              className="font-semibold text-[var(--text)] underline-offset-2 hover:underline"
                            >
                              Sign in
                            </Link>
                          </p>
                        ) : null}
                      </>
                    )}
                    {failedWithMaxGuesses && pendingFailedAutoAdvance ? (
                      <p className="text-center text-xs font-semibold text-white/60">
                        Continuing in 2s...
                      </p>
                    ) : null}
                  </div>

                  {currentFinished && !failedWithMaxGuesses ? (
                    <div
                      className={`rounded-2xl border border-white/10 bg-[rgba(26,10,46,0.6)] p-4 shadow-sm ${challengeVisualFadeClassName}`}
                    >
                      <div className="text-base font-extrabold md:text-lg">
                        Result
                      </div>
                      <div className="mt-1 text-sm text-white/70">
                        Answer:{" "}
                        <span className="font-bold text-white">
                          {currentAnswer}
                        </span>
                      </div>
                      <div className="mt-3">
                        {pendingAutoAdvance ? (
                          <p className="text-sm font-semibold text-[var(--success)]">
                            Correct! Continuing…
                          </p>
                        ) : solvedWithCorrect ? (
                          <>
                            {!isLastChallenge ? (
                              <button
                                type="button"
                                disabled={challengeTransitioning}
                                onClick={() =>
                                  advanceAfterTransitionOut(false)
                                }
                                className="inline-flex min-h-[48px] items-center justify-center rounded-full bg-[var(--accent)] px-5 text-sm font-bold text-white shadow-sm transition-colors hover:bg-[var(--accent2)] disabled:opacity-40 md:rounded-xl"
                              >
                                Next challenge
                              </button>
                            ) : (
                              <button
                                type="button"
                                disabled={challengeTransitioning}
                                onClick={() => advanceAfterTransitionOut(true)}
                                className="inline-flex min-h-[48px] items-center justify-center rounded-full bg-[var(--accent)] px-5 text-sm font-bold text-white shadow-sm transition-colors hover:bg-[var(--accent2)] disabled:opacity-40 md:rounded-xl"
                              >
                                View daily summary
                              </button>
                            )}
                          </>
                        ) : !isLastChallenge ? (
                          <button
                            type="button"
                            disabled={challengeTransitioning}
                            onClick={() => advanceAfterTransitionOut(false)}
                            className="inline-flex min-h-[48px] items-center justify-center rounded-full bg-[var(--accent)] px-5 text-sm font-bold text-white shadow-sm transition-colors hover:bg-[var(--accent2)] disabled:opacity-40 md:rounded-xl"
                          >
                            Next challenge
                          </button>
                        ) : (
                          <button
                            type="button"
                            disabled={challengeTransitioning}
                            onClick={() => advanceAfterTransitionOut(true)}
                            className="inline-flex min-h-[48px] items-center justify-center rounded-full bg-[var(--accent)] px-5 text-sm font-bold text-white shadow-sm transition-colors hover:bg-[var(--accent2)] disabled:opacity-40 md:rounded-xl"
                          >
                            View daily summary
                          </button>
                        )}
                      </div>
                    </div>
                  ) : null}
                </>
              )}
            </div>
          </>
        )}
        </div>
        </PullToRefresh>

        <GameplayProfileSheet
          open={profilePreviewHandle != null}
          onClose={() => setProfilePreviewHandle(null)}
          usernameHandle={profilePreviewHandle}
        />

        <BadgeUnlockSheet
          badgeId={badgeUnlockQueue[0] ?? null}
          onDismiss={() => setBadgeUnlockQueue((q) => q.slice(1))}
        />

      {modalPortalEl && modalImageUrl
        ? createPortal(
            <div
              ref={modalLayerRef}
              className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
              role="dialog"
              aria-modal="true"
              aria-label="Challenge image"
              style={{ touchAction: "none" } as CSSProperties}
              onClick={(e) => {
                if (e.target === e.currentTarget && modalScale <= 1) {
                  resetModalImageViewer();
                }
              }}
            >
          <div
            className="pointer-events-none absolute inset-0 z-0"
            style={
              {
                backgroundColor: "rgba(0,0,0,0.95)",
                opacity: modalBackdropOpacity,
                transition: modalBackdropCssTransition,
              } as CSSProperties
            }
            aria-hidden
          />
          <button
            type="button"
            aria-label="Close"
            className="absolute right-4 top-4 z-20 flex h-11 w-11 items-center justify-center rounded-full border border-white/20 bg-black/70 text-2xl leading-none text-white hover:bg-white/10"
            onClick={(e) => {
              e.stopPropagation();
              resetModalImageViewer();
            }}
          >
            ×
          </button>
          <img
            src={modalImageUrl}
            alt=""
            className="relative z-10 max-h-[90dvh] max-w-full object-contain"
            style={
              {
                transform: `translate3d(${modalOffset.x}px, ${modalOffset.y + modalPullDy}px, 0) scale(${modalScale})`,
                transformOrigin: "center center",
                touchAction: "none",
                transition: modalImgCssTransition,
                WebkitBackfaceVisibility: "hidden",
                backfaceVisibility: "hidden",
              } as CSSProperties
            }
            onClick={(e) => e.stopPropagation()}
            onTouchStart={(e) => {
              e.stopPropagation();
              if (e.touches.length === 2) {
                modalPullStartYRef.current = null;
                setModalPullDragging(false);
                const d = distanceBetweenTouches(e.touches);
                if (d > 0) {
                  pinchStartDistanceRef.current = d;
                  pinchStartScaleRef.current = modalScale;
                }
                panStartRef.current = null;
                return;
              }
              if (e.touches.length === 1) {
                const t = e.touches[0];
                const now = Date.now();
                const prev = lastTapRef.current;
                if (
                  prev &&
                  now - prev.ts < 280 &&
                  Math.hypot(prev.x - t.clientX, prev.y - t.clientY) < 24
                ) {
                  setModalScale(1);
                  setModalOffset({ x: 0, y: 0 });
                  setModalPullDy(0);
                  modalPullDyRef.current = 0;
                  modalPullStartYRef.current = null;
                  setModalPullDragging(false);
                  setModalPullTransition(null);
                  setModalBackdropOpacity(MODAL_SCRIM_MAX_OPACITY);
                  lastTapRef.current = null;
                  return;
                }
                lastTapRef.current = { ts: now, x: t.clientX, y: t.clientY };
                if (modalScale > 1) {
                  panStartRef.current = { x: t.clientX, y: t.clientY };
                  panStartOffsetRef.current = { ...modalOffset };
                } else {
                  panStartRef.current = null;
                  beginModalPullGesture(t.clientY);
                }
              }
            }}
            onTouchMove={(e) => {
              e.stopPropagation();
              if (e.touches.length === 2) {
                e.preventDefault();
                const currentDist = distanceBetweenTouches(e.touches);
                if (!pinchStartDistanceRef.current || currentDist <= 0) return;
                const ratio = currentDist / pinchStartDistanceRef.current;
                const nextScale = clampScale(pinchStartScaleRef.current * ratio);
                setModalScale(nextScale);
                if (nextScale <= 1) {
                  setModalOffset({ x: 0, y: 0 });
                  setModalPullDy(0);
                  modalPullDyRef.current = 0;
                  setModalPullTransition(null);
                  setModalBackdropOpacity(MODAL_SCRIM_MAX_OPACITY);
                }
                return;
              }
              if (e.touches.length === 1 && modalScale > 1 && panStartRef.current) {
                e.preventDefault();
                const t = e.touches[0];
                const dx = t.clientX - panStartRef.current.x;
                const dy = t.clientY - panStartRef.current.y;
                setModalOffset({
                  x: panStartOffsetRef.current.x + dx,
                  y: panStartOffsetRef.current.y + dy,
                });
                return;
              }
              if (e.touches.length === 1 && modalScale <= 1) {
                e.preventDefault();
                moveModalPullGesture(e.touches[0].clientY);
              }
            }}
            onTouchEnd={(e) => {
              e.stopPropagation();
              if (e.touches.length < 2) {
                pinchStartDistanceRef.current = null;
              }
              if (e.touches.length === 0) {
                panStartRef.current = null;
                if (modalScale <= 1) {
                  endModalPullGesture();
                  setModalScale(1);
                  setModalOffset({ x: 0, y: 0 });
                } else {
                  modalPullStartYRef.current = null;
                  setModalPullDragging(false);
                }
              }
            }}
          />
            </div>,
            modalPortalEl,
          )
        : null}
      {confettiBursts.map((burstId) => (
        <div
          key={burstId}
          aria-hidden
          className="pointer-events-none fixed inset-0 z-[250] overflow-hidden"
        >
          {Array.from({ length: 20 }).map((_, i) => {
            const angleDeg = (360 / 20) * i + ((burstId + i) % 19) - 9;
            const distance = 72 + ((burstId + i * 17) % 55);
            const hue = (burstId + i * 31) % 360;
            return (
              <span
                key={`${burstId}-${i}`}
                className="confetti-dot"
                style={
                  {
                    "--dx": `${Math.cos((angleDeg * Math.PI) / 180) * distance}px`,
                    "--dy": `${-Math.sin((angleDeg * Math.PI) / 180) * distance - 28}px`,
                    backgroundColor: `hsl(${hue} 90% 60%)`,
                  } as CSSProperties
                }
              />
            );
          })}
        </div>
      ))}
      <FirstPlayTutorial
        step={tutorialStep}
        imageRef={tutorialImageRef}
        guessInputRef={guessInputRef}
        onNext={() =>
          setTutorialStep((s) => (s === 1 ? 2 : s === 2 ? 3 : s))
        }
        onSkip={dismissTutorial}
        onComplete={dismissTutorial}
      />
      </div>
    </AppSiteChrome>
  );
}
