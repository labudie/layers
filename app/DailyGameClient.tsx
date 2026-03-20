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

  const challengesRef = useRef(challenges);
  useEffect(() => {
    challengesRef.current = challenges;
  }, [challengeIdsKey]);

  const currentChallenge = challenges[currentChallengeIndex] ?? null;
  const currentGuesses = guessesByIndex[currentChallengeIndex] ?? [];
  const currentAnswer = currentChallenge?.layer_count ?? null;

  const currentFinished = useMemo(
    () => isChallengeFinished(currentAnswer, currentGuesses),
    [currentAnswer, currentGuesses]
  );

  const canGuess = Boolean(
    !showSummary &&
      signedIn &&
      userId &&
      currentChallenge?.id &&
      currentAnswer &&
      currentAnswer > 0 &&
      !currentFinished
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
    if (!canvasRef.current || !currentChallenge) return;
    const seed = canvasSeedForChallenge(currentChallenge);
    drawProcedural(canvasRef.current, seed);
    const onResize = () => {
      if (!canvasRef.current) return;
      drawProcedural(canvasRef.current, seed);
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [currentChallenge?.id]);

  const submitGuess = useCallback(async () => {
    if (!canGuess || typeof guessInput !== "number" || !currentAnswer) return;
    if (!userId || !currentChallenge?.id) return;

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
  }, [
    canGuess,
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

  return (
    <div className="min-h-screen w-full bg-black text-white">
      <div className="mx-auto w-full max-w-3xl px-5 py-6">
        <header className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-4">
            <div className="text-xl font-extrabold tracking-tight">layers</div>
            <Link
              href="/leaderboard"
              className="shrink-0 text-sm font-semibold text-white/70 underline-offset-4 hover:text-white hover:underline"
            >
              Leaderboard
            </Link>
          </div>
          <div className="flex shrink-0 items-center gap-3">
            {signedIn ? (
              <div className="hidden sm:block text-sm text-white/70">
                {userEmail}
              </div>
            ) : (
              <Link
                href="/login"
                className="rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-sm font-semibold hover:bg-white/10"
              >
                Sign in to play
              </Link>
            )}

            {signedIn && (
              <button
                type="button"
                onClick={signOut}
                className="rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-sm font-semibold hover:bg-white/10"
              >
                Sign out
              </button>
            )}

            <div className="rounded-full border border-white/15 bg-white/5 px-3 py-1 text-sm font-semibold">
              {total ? `Daily #${dayNumber ?? "—"}` : "Daily"}
            </div>
          </div>
        </header>

        <div className="mt-6 flex items-center justify-between rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
          <div className="text-sm text-white/70">Next challenge in</div>
          <div
            className="font-mono text-base font-semibold"
            style={{ letterSpacing: "0.02em" }}
          >
            {countdownText ?? "--:--:--"}
          </div>
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
            <div className="mt-6 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-center">
              <div className="text-sm font-semibold text-white/90">
                Challenge {currentChallengeIndex + 1} of {total}
              </div>
              <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
                <div
                  className="h-full rounded-full bg-white/50 transition-all"
                  style={{
                    width: `${((currentChallengeIndex + (currentFinished ? 1 : 0)) / total) * 100}%`,
                  }}
                />
              </div>
            </div>

            {currentChallenge && (
              <>
                <div className="mt-6 rounded-2xl border border-white/10 bg-white/5 p-5">
                  <div className="text-xs font-semibold uppercase tracking-wider text-white/50">
                    Today&apos;s challenge
                  </div>
                  <div className="mt-2 text-2xl font-extrabold leading-tight">
                    {currentChallenge.title ?? "Untitled"}
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <span className="rounded-full border border-white/15 bg-black/40 px-3 py-1 text-sm text-white/80">
                      Software: {currentChallenge.software ?? "—"}
                    </span>
                    <span className="rounded-full border border-white/15 bg-black/40 px-3 py-1 text-sm text-white/80">
                      Category: {currentChallenge.category ?? "—"}
                    </span>
                  </div>
                </div>

                <div className="mt-6 rounded-2xl border border-white/10 bg-white/5 p-4">
                  <canvas
                    ref={canvasRef}
                    className="w-full rounded-xl"
                    style={{
                      height: 360,
                      background: "rgba(255,255,255,0.03)",
                    }}
                  />
                  <div className="mt-3 text-xs text-white/50">
                    Procedural placeholder (seed:{" "}
                    {currentChallenge.day_number ?? "—"} · pos{" "}
                    {currentChallenge.position ?? currentChallengeIndex + 1})
                  </div>
                </div>

                <div className="mt-6 rounded-2xl border border-white/10 bg-white/5 p-5">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                    <div className="flex-1">
                      <div className="text-sm font-semibold text-white/80">
                        Guess the layer count
                      </div>
                      {!signedIn && (
                        <div className="mt-1 text-xs text-white/55">
                          Sign in to submit guesses.
                        </div>
                      )}
                      <input
                        type="number"
                        inputMode="numeric"
                        min={0}
                        disabled={!canGuess}
                        value={guessInput}
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
                        className="mt-2 w-full rounded-xl border border-white/15 bg-black/40 px-4 py-3 text-white outline-none placeholder:text-white/30 disabled:opacity-40"
                        placeholder="Type a number…"
                      />
                    </div>
                    <button
                      type="button"
                      disabled={!canGuess || typeof guessInput !== "number"}
                      onClick={() => void submitGuess()}
                      className="rounded-xl bg-white px-5 py-3 text-sm font-bold text-black disabled:opacity-40"
                    >
                      Submit
                    </button>
                  </div>

                  <div className="mt-5 grid gap-2">
                    {Array.from({ length: 6 }).map((_, i) => {
                      const g = currentGuesses[i];
                      const color =
                        g?.verdict === "correct"
                          ? "rgba(34,197,94,0.9)"
                          : g?.verdict === "close"
                            ? "rgba(234,179,8,0.9)"
                            : g
                              ? "rgba(239,68,68,0.9)"
                              : "rgba(255,255,255,0.08)";
                      const bar = g
                        ? Math.max(0.06, clamp01(g.closeness))
                        : 0;
                      const label = !g
                        ? `Attempt ${i + 1}`
                        : g.verdict === "correct"
                          ? `${g.value} — correct`
                          : `${g.value} — too ${g.direction}`;

                      return (
                        <div
                          key={i}
                          className="rounded-xl border border-white/10 bg-black/30 px-4 py-3"
                        >
                          <div className="flex items-center justify-between gap-3">
                            <div className="text-sm font-semibold text-white/85">
                              {label}
                            </div>
                            <div className="text-xs text-white/45">#{i + 1}</div>
                          </div>
                          <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-white/10">
                            <div
                              className="h-full rounded-full"
                              style={{
                                width: `${Math.round(bar * 100)}%`,
                                backgroundColor: color,
                              }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {currentFinished && (
                  <div className="mt-6 rounded-2xl border border-white/10 bg-white/5 p-5">
                    <div className="text-lg font-extrabold">Result</div>
                    <div className="mt-2 text-white/80">
                      Answer:{" "}
                      <span className="font-bold text-white">
                        {currentAnswer}
                      </span>
                    </div>
                    <div className="mt-4">
                      {!isLastChallenge ? (
                        <button
                          type="button"
                          onClick={() => {
                            setCurrentChallengeIndex((x) => x + 1);
                            setGuessInput("");
                          }}
                          className="rounded-xl bg-white px-5 py-3 text-sm font-bold text-black"
                        >
                          Next challenge
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setShowSummary(true)}
                          className="rounded-xl bg-white px-5 py-3 text-sm font-bold text-black"
                        >
                          View daily summary
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
