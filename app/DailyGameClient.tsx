/* eslint-disable @next/next/no-img-element */
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Challenge } from "./page";
import { supabase } from "@/lib/supabase";

type GuessRow = {
  value: number;
  verdict: "correct" | "close" | "wrong";
  direction: "high" | "low" | "equal";
  closeness: number;
};

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

function isChallengeFinished(
  answer: number | null | undefined,
  guesses: GuessRow[]
) {
  if (!answer || answer <= 0) return false;
  return guesses.some((g) => g.verdict === "correct") || guesses.length >= 6;
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

export function DailyGameClient({
  challenges,
  userEmail,
  userId,
}: {
  challenges: Challenge[];
  userEmail: string | null;
  userId: string | null;
}) {
  const total = challenges.length;
  const dayNumber = challenges[0]?.day_number ?? null;
  const signedIn = Boolean(userEmail);

  const challengeIdsKey = useMemo(
    () => challenges.map((c) => c.id).join(","),
    [challenges]
  );

  const router = useRouter();
  const [countdownText, setCountdownText] = useState<string | null>(null);
  const [guessInput, setGuessInput] = useState<number | "">("");
  const [guessesByIndex, setGuessesByIndex] = useState<GuessRow[][]>(() =>
    challenges.map(() => [])
  );
  const [currentChallengeIndex, setCurrentChallengeIndex] = useState(0);
  const [showSummary, setShowSummary] = useState(false);
  const [copied, setCopied] = useState(false);
  /** After a correct submit, brief hold before auto-advance (no "Next" click). */
  const [pendingAutoAdvance, setPendingAutoAdvance] = useState(false);
  /** Opacity fade on title, image, attempt rows, result only — not whole page. */
  const [challengeTransitioning, setChallengeTransitioning] = useState(false);
  /** Hydration-safe: dynamic transition classes only after mount. */
  const [mounted, setMounted] = useState(false);
  const [infoPopoverOpen, setInfoPopoverOpen] = useState(false);
  const infoButtonRef = useRef<HTMLButtonElement | null>(null);
  const infoPopoverRef = useRef<HTMLDivElement | null>(null);
  const guessInputRef = useRef<HTMLInputElement | null>(null);

  const autoAdvanceTimeoutRef = useRef<number | null>(null);
  const fadeTimeoutRef = useRef<number | null>(null);
  const revealTimeoutRef = useRef<number | null>(null);

  const challengesRef = useRef(challenges);
  useEffect(() => {
    challengesRef.current = challenges;
  }, [challengeIdsKey]);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    setInfoPopoverOpen(false);
  }, [currentChallengeIndex, challengeIdsKey]);

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
    };
  }, []);

  useEffect(() => {
    if (showSummary) setChallengeTransitioning(false);
  }, [showSummary]);

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
  const currentGuesses = guessesByIndex[currentChallengeIndex] ?? [];
  const currentAnswer = currentChallenge?.layer_count ?? null;

  const currentFinished = useMemo(
    () => isChallengeFinished(currentAnswer, currentGuesses),
    [currentAnswer, currentGuesses]
  );

  const solvedWithCorrect = currentGuesses.some((g) => g.verdict === "correct");

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

  // Restore guesses + resume position / summary
  useEffect(() => {
    const list = challengesRef.current;
    let cancelled = false;

    (async () => {
      if (!list.length) {
        if (!cancelled) {
          setGuessesByIndex([]);
          setCurrentChallengeIndex(0);
          setShowSummary(false);
        }
        return;
      }

      if (!userId) {
        if (!cancelled) {
          setGuessesByIndex(list.map(() => []));
          setCurrentChallengeIndex(0);
          setShowSummary(false);
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
        matrix.push(restored.slice(0, 6));
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
    })();

    return () => {
      cancelled = true;
    };
  }, [userId, challengeIdsKey]);

  // Insert results per challenge when finished (includes position)
  useEffect(() => {
    if (!userId || !challenges.length) return;

    let cancelled = false;

    (async () => {
      const list = challengesRef.current;
      for (let idx = 0; idx < list.length; idx++) {
        const ch = list[idx];
        const g = guessesByIndex[idx] ?? [];
        const ans = ch.layer_count ?? 0;
        if (ans <= 0 || g.length === 0) continue;
        if (!isChallengeFinished(ans, g)) continue;

        const sb = supabase();
        const { data: existing } = await sb
          .from("results")
          .select("id")
          .eq("user_id", userId)
          .eq("challenge_id", ch.id)
          .maybeSingle();

        if (cancelled || existing) continue;

        const position =
          typeof ch.position === "number" ? ch.position : idx + 1;

        await sb.from("results").insert({
          user_id: userId,
          challenge_id: ch.id,
          solved: g.some((x) => x.verdict === "correct"),
          attempts_used: g.length,
          position,
        });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [userId, challengeIdsKey, guessesByIndex]);

  useEffect(() => {
    const tick = () => {
      const secondsLeft = secondsUntilLocalMidnight(new Date());
      setCountdownText(formatHMS(secondsLeft));
    };
    tick();
    const t = window.setInterval(tick, 250);
    return () => window.clearInterval(t);
  }, []);

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

  /** Fade out challenge visuals for 300ms, swap challenge or open summary, then fade in. */
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
        setShowSummary(true);
      } else {
        setCurrentChallengeIndex((x) => x + 1);
        setGuessInput("");
      }
      revealTimeoutRef.current = window.setTimeout(() => {
        revealTimeoutRef.current = null;
        setChallengeTransitioning(false);
      }, 0);
    }, 300);
  }, []);

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

    setGuessesByIndex((prev) => {
      const next = prev.map((arr, i) =>
        i === idx ? [...arr, nextRow].slice(0, 6) : arr
      );
      return next;
    });
    setGuessInput("");

    if (verdict === "correct") {
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
  ]);

  async function signOut() {
    await supabase().auth.signOut();
    router.refresh();
  }

  async function shareDaily() {
    if (!challenges.length) return;
    const dn = dayNumber ?? "—";
    const gridLines = guessesByIndex.map((guesses) =>
      guesses.map((g) => emojiForVerdict(g.verdict)).join("")
    );
    const text = [`layers #${dn}`, "", ...gridLines].join("\n");

    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore
    }
  }

  const isLastChallenge = currentChallengeIndex >= total - 1;

  const challengeVisualFadeClassName = mounted
    ? `transition-opacity duration-300 ease-out ${
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

  return (
    <div
      className="flex min-h-screen w-full flex-col bg-black text-white"
      style={{ scrollPaddingBottom: "9rem" }}
    >
      <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-4 py-4 md:px-5 md:py-6">
        <header className="flex shrink-0 items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2 md:gap-4">
            <div className="shrink-0 text-xl font-extrabold tracking-tight">
              Layers
            </div>
            <Link
              href="/leaderboard"
              className="hidden shrink-0 text-sm font-semibold text-white/70 underline-offset-4 hover:text-white hover:underline md:inline"
            >
              Leaderboard
            </Link>
          </div>
          <div className="flex min-w-0 flex-col items-end gap-1 text-right">
            <div className="shrink-0 rounded-full border border-white/15 bg-white/5 px-4 py-1.5 text-base font-semibold">
              {total ? `Daily #${dayNumber ?? "—"}` : "Daily"}
            </div>
            <div className="text-base text-white/75" style={{ letterSpacing: "0.01em" }}>
              <span>Next challenge </span>
              <span className="font-mono font-bold text-white">
                {countdownText ?? "--:--:--"}
              </span>
            </div>
          </div>
        </header>

        <div className="mt-3 hidden flex-wrap items-center justify-end gap-2 border-b border-white/10 pb-4 md:flex md:gap-3">
          {signedIn ? (
            <div className="hidden text-sm text-white/70 sm:block">{userEmail}</div>
          ) : (
            <Link
              href="/login"
              className="rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-sm font-semibold hover:bg-white/10"
            >
              Sign in
            </Link>
          )}
          {signedIn && (
            <>
              <Link
                href="/profile"
                className="rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-sm font-semibold hover:bg-white/10"
              >
                Profile
              </Link>
              <button
                type="button"
                onClick={() => void signOut()}
                className="rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-sm font-semibold hover:bg-white/10"
              >
                Sign out
              </button>
            </>
          )}
        </div>

        {!total ? (
          <div className="mt-10 flex items-center justify-center">
            <div className="text-lg font-semibold text-white/80">
              No challenge today
            </div>
          </div>
        ) : showSummary ? (
          <div className="mt-8 space-y-6">
            <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-center text-sm font-semibold text-white/80">
              Daily complete · {total} challenges
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
                      className="rounded-xl border border-white/10 bg-black/30 p-4"
                    >
                      <div className="text-xs font-semibold uppercase tracking-wider text-white/45">
                        Challenge {i + 1}
                        {ch.position != null ? ` · #${ch.position}` : ""}
                      </div>
                      <div className="mt-1 font-semibold text-white">
                        {ch.title ?? "Untitled"}
                      </div>
                      <div className="mt-2 text-sm text-white/70">
                        Answer:{" "}
                        <span className="font-bold text-white">{ans ?? "—"}</span>
                        {" · "}
                        {solved ? "Solved" : "Not solved"} · {g.length}/6 attempts
                      </div>
                      {emojiRow ? (
                        <div className="mt-2 font-mono text-lg tracking-widest">
                          {emojiRow}
                        </div>
                      ) : null}
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
                {copied ? "Copied!" : "Share"}
              </button>
              <p className="mt-2 text-xs text-white/45">
                Copies a {total}-row emoji grid (one row per challenge).
              </p>
            </div>
          </div>
        ) : (
          <>
            <div className="mt-3 flex min-h-0 flex-1 flex-col gap-4 md:mt-6 md:gap-6">
              {currentChallenge && (
                <>
                  <div
                    className={`relative -mx-4 min-h-0 flex-1 md:mx-0 ${challengeVisualFadeClassName}`}
                  >
                    <div className="aspect-[3/4] overflow-hidden rounded-2xl border border-white/15 bg-black md:aspect-[4/3]">
                      {currentChallenge.image_url ? (
                        <img
                          src={currentChallenge.image_url}
                          alt=""
                          className="block h-full w-full object-cover"
                          style={{ background: "#000" }}
                        />
                      ) : (
                        <canvas
                          ref={canvasRef}
                          className="block h-full w-full"
                          style={{ background: "#000" }}
                        />
                      )}
                    </div>
                  </div>

                  <div
                    className={`relative flex items-start gap-3 ${challengeVisualFadeClassName}`}
                  >
                    <div className="min-w-0 flex-1">
                      <h2 className="text-lg font-bold leading-snug md:text-2xl">
                        {currentChallenge.title ?? "Untitled"}
                      </h2>
                      <p className="mt-1 text-3xl font-extrabold tabular-nums tracking-tight text-white md:text-4xl">
                        {currentChallengeIndex + 1}/{total}
                      </p>
                    </div>
                    <div className="relative shrink-0 pt-0.5">
                      <button
                        ref={infoButtonRef}
                        type="button"
                        aria-expanded={infoPopoverOpen}
                        aria-haspopup="dialog"
                        aria-label="Challenge details"
                        onClick={() => setInfoPopoverOpen((o) => !o)}
                        className="flex h-9 w-9 items-center justify-center rounded-full border border-white/25 text-base font-serif font-bold leading-none text-white/85 hover:bg-white/10"
                      >
                        ⓘ
                      </button>
                      {infoPopoverOpen ? (
                        <div
                          ref={infoPopoverRef}
                          role="dialog"
                          aria-label="Challenge info"
                          className="absolute right-0 top-full z-[60] mt-2 w-[min(18rem,calc(100vw-2rem))] rounded-xl border border-white/15 bg-zinc-900/98 p-3.5 text-left text-xs shadow-2xl backdrop-blur-md"
                        >
                          <p className="text-white/85">
                            <span className="font-semibold text-white">
                              Creator:
                            </span>{" "}
                            —
                          </p>
                          <p className="mt-2 text-white/85">
                            <span className="font-semibold text-white">
                              Software:
                            </span>{" "}
                            {currentChallenge.software ?? "—"}
                          </p>
                          <p className="mt-1.5 text-white/85">
                            <span className="font-semibold text-white">
                              Category:
                            </span>{" "}
                            {currentChallenge.category ?? "—"}
                          </p>
                        </div>
                      ) : null}
                    </div>
                  </div>

                  <div className="space-y-2.5">
                    <div className="hidden text-sm font-semibold text-white/70 md:block">
                      Guess the layer count
                    </div>
                    {currentGuesses.length > 0 ? (
                      <div
                        className={`flex flex-nowrap gap-0.5 sm:gap-1 ${challengeVisualFadeClassName}`}
                        role="list"
                        aria-label="Guess history"
                      >
                        {currentGuesses.map((g, i) => {
                          const isCorrect = g.verdict === "correct";
                          const sub =
                            isCorrect
                              ? "Correct"
                              : g.direction === "high"
                                ? "↓ too high"
                                : g.direction === "low"
                                  ? "↑ too low"
                                  : "—";
                          return (
                            <div
                              key={`${g.value}-${i}`}
                              role="listitem"
                              className={`flex min-h-[2.85rem] min-w-0 flex-1 flex-col items-center justify-center rounded border border-black/25 px-px py-0.5 text-center sm:min-h-[3.1rem] sm:rounded-md sm:px-0.5 sm:py-1 ${
                                isCorrect
                                  ? "bg-emerald-600 text-white"
                                  : "bg-red-600 text-white"
                              }`}
                            >
                              <span className="text-[0.7rem] font-bold tabular-nums leading-none sm:text-xs">
                                {g.value}
                              </span>
                              <span className="mt-0.5 max-w-full truncate px-px text-[0.45rem] font-medium leading-[1.05] text-white/95 sm:text-[0.5rem]">
                                {sub}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    ) : null}

                    <div className="flex flex-col gap-2.5 md:flex-row md:items-center md:gap-3">
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
                        className="h-12 w-full rounded-full border-0 bg-white px-5 text-base font-medium text-black outline-none placeholder:text-neutral-400 focus-visible:ring-2 focus-visible:ring-white/40 disabled:opacity-40 md:rounded-xl md:px-4"
                        placeholder="Layer count…"
                      />
                      <button
                        type="button"
                        disabled={
                          !canSubmitGuess || typeof guessInput !== "number"
                        }
                        onClick={() => void submitGuess()}
                        className="h-11 w-full shrink-0 rounded-full bg-white text-sm font-bold text-black disabled:opacity-40 md:h-12 md:w-auto md:rounded-xl md:px-8"
                      >
                        Submit
                      </button>
                    </div>
                    {!signedIn && roundActive ? (
                      <p className="text-center text-sm text-white/55">
                        Sign in to save your progress —{" "}
                        <Link
                          href="/login"
                          className="font-semibold text-white/85 underline-offset-2 hover:text-white hover:underline"
                        >
                          Sign in
                        </Link>
                      </p>
                    ) : null}
                  </div>

                  {currentFinished ? (
                    <div
                      className={`rounded-xl border border-white/10 bg-white/[0.06] p-4 ${challengeVisualFadeClassName}`}
                    >
                      <div className="text-base font-extrabold md:text-lg">
                        Result
                      </div>
                      <div className="mt-1 text-sm text-white/80">
                        Answer:{" "}
                        <span className="font-bold text-white">
                          {currentAnswer}
                        </span>
                      </div>
                      <div className="mt-3">
                        {pendingAutoAdvance ? (
                          <p className="text-sm font-semibold text-emerald-300/95">
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
                                className="rounded-full bg-white px-5 py-2.5 text-sm font-bold text-black disabled:opacity-40 md:rounded-xl md:py-3"
                              >
                                Next challenge
                              </button>
                            ) : (
                              <button
                                type="button"
                                disabled={challengeTransitioning}
                                onClick={() => advanceAfterTransitionOut(true)}
                                className="rounded-full bg-white px-5 py-2.5 text-sm font-bold text-black disabled:opacity-40 md:rounded-xl md:py-3"
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
                            className="rounded-full bg-white px-5 py-2.5 text-sm font-bold text-black disabled:opacity-40 md:rounded-xl md:py-3"
                          >
                            Next challenge
                          </button>
                        ) : (
                          <button
                            type="button"
                            disabled={challengeTransitioning}
                            onClick={() => advanceAfterTransitionOut(true)}
                            className="rounded-full bg-white px-5 py-2.5 text-sm font-bold text-black disabled:opacity-40 md:rounded-xl md:py-3"
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
    </div>
  );
}
