/* eslint-disable @next/next/no-img-element */
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Challenge } from "./page";
import { createSupabaseBrowserClient } from "@/lib/supabase";

type GuessRow = {
  value: number;
  verdict: "correct" | "close" | "wrong";
  direction: "high" | "low" | "equal";
  closeness: number; // 0..1 (1 is perfect)
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

  // Background gradient
  const g = ctx.createLinearGradient(0, 0, cssW, cssH);
  g.addColorStop(0, `hsl(${Math.floor(rand() * 360)}, 60%, 10%)`);
  g.addColorStop(1, `hsl(${Math.floor(rand() * 360)}, 60%, 16%)`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, cssW, cssH);

  // Soft noise blobs
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

  // Layered strokes
  ctx.globalAlpha = 0.9;
  for (let i = 0; i < 10; i++) {
    const hue = Math.floor(rand() * 360);
    ctx.strokeStyle = `hsla(${hue}, 75%, 70%, 0.35)`;
    ctx.lineWidth = 1 + rand() * 2;
    ctx.beginPath();
    const y0 = rand() * cssH;
    ctx.moveTo(-20, y0);
    for (let x = 0; x <= cssW + 20; x += 40) {
      const y = y0 + Math.sin((x / cssW) * Math.PI * 2 + rand() * 3) * (10 + rand() * 35);
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  // Title watermark
  ctx.fillStyle = "rgba(255,255,255,0.07)";
  ctx.font = "700 64px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial";
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

export function DailyGameClient({
  challenge,
  today,
  userEmail,
}: {
  challenge: Challenge | null;
  today: string;
  userEmail: string | null;
}) {
  const answer = challenge?.layer_count ?? null;
  const dayNumber = challenge?.day_number ?? null;
  const signedIn = Boolean(userEmail);

  const router = useRouter();
  const [countdownText, setCountdownText] = useState<string | null>(null);
  const [guessInput, setGuessInput] = useState<number | "">("");
  const [guesses, setGuesses] = useState<GuessRow[]>([]);
  const [copied, setCopied] = useState(false);

  const finished = useMemo(() => {
    if (!answer || answer <= 0) return false;
    const hit = guesses.some((g) => g.verdict === "correct");
    return hit || guesses.length >= 6;
  }, [answer, guesses]);

  const canGuess = Boolean(
    signedIn && challenge && answer && answer > 0 && !finished
  );

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
    if (!canvasRef.current) return;
    const seed = typeof dayNumber === "number" ? dayNumber : 1;
    drawProcedural(canvasRef.current, seed);

    const onResize = () => {
      if (!canvasRef.current) return;
      drawProcedural(canvasRef.current, seed);
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [dayNumber]);

  function submitGuess() {
    if (!canGuess || typeof guessInput !== "number" || !answer) return;
    const v = Math.max(0, Math.floor(guessInput));
    const { verdict, direction, closeness } = verdictForGuess(v, answer);
    setGuesses((prev) => [...prev, { value: v, verdict, direction, closeness }].slice(0, 6));
    setGuessInput("");
  }

  async function signOut() {
    const supabase = createSupabaseBrowserClient();
    await supabase.auth.signOut();
    router.refresh();
  }

  async function share() {
    if (!challenge) return;
    const header = `Layers Daily #${dayNumber ?? "—"} (${today})`;
    const grid =
      guesses.length === 0
        ? "(no guesses)"
        : guesses.map((g) => emojiForVerdict(g.verdict)).join("");
    const score =
      guesses.some((g) => g.verdict === "correct")
        ? `${guesses.findIndex((g) => g.verdict === "correct") + 1}/6`
        : `X/6`;
    const text = `${header}\n${score}\n${grid}`;

    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // ignore
    }
  }

  return (
    <div className="min-h-screen w-full bg-black text-white">
      <div className="mx-auto w-full max-w-3xl px-5 py-6">
        <header className="flex items-center justify-between">
          <div className="text-xl font-extrabold tracking-tight">layers</div>
          <div className="flex items-center gap-3">
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
              {challenge ? `Daily #${dayNumber ?? "—"}` : "Daily"}
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

        {!challenge ? (
          <div className="mt-10 flex items-center justify-center">
            <div className="text-lg font-semibold text-white/80">
              No challenge today
            </div>
          </div>
        ) : (
          <>
            <div className="mt-6 rounded-2xl border border-white/10 bg-white/5 p-5">
              <div className="text-xs font-semibold uppercase tracking-wider text-white/50">
                Today’s challenge
              </div>
              <div className="mt-2 text-2xl font-extrabold leading-tight">
                {challenge.title ?? "Untitled"}
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <span className="rounded-full border border-white/15 bg-black/40 px-3 py-1 text-sm text-white/80">
                  Software: {challenge.software ?? "—"}
                </span>
                <span className="rounded-full border border-white/15 bg-black/40 px-3 py-1 text-sm text-white/80">
                  Category: {challenge.category ?? "—"}
                </span>
              </div>
            </div>

            <div className="mt-6 rounded-2xl border border-white/10 bg-white/5 p-4">
              <canvas
                ref={canvasRef}
                className="w-full rounded-xl"
                style={{ height: 360, background: "rgba(255,255,255,0.03)" }}
              />
              <div className="mt-3 text-xs text-white/50">
                Procedural placeholder (seed: {dayNumber ?? "—"})
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
                        e.target.value === "" ? "" : Number(e.target.value)
                      )
                    }
                    onKeyDown={(e) => {
                      if (e.key === "Enter") submitGuess();
                    }}
                    className="mt-2 w-full rounded-xl border border-white/15 bg-black/40 px-4 py-3 text-white outline-none placeholder:text-white/30 disabled:opacity-40"
                    placeholder="Type a number…"
                  />
                </div>
                <button
                  type="button"
                  disabled={!canGuess || typeof guessInput !== "number"}
                  onClick={submitGuess}
                  className="rounded-xl bg-white px-5 py-3 text-sm font-bold text-black disabled:opacity-40"
                >
                  Submit
                </button>
              </div>

              <div className="mt-5 grid gap-2">
                {Array.from({ length: 6 }).map((_, i) => {
                  const g = guesses[i];
                  const color =
                    g?.verdict === "correct"
                      ? "rgba(34,197,94,0.9)"
                      : g?.verdict === "close"
                        ? "rgba(234,179,8,0.9)"
                        : g
                          ? "rgba(239,68,68,0.9)"
                          : "rgba(255,255,255,0.08)";
                  const bar = g ? Math.max(0.06, clamp01(g.closeness)) : 0;
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

            {finished && (
              <div className="mt-6 rounded-2xl border border-white/10 bg-white/5 p-5">
                <div className="text-lg font-extrabold">Result</div>
                <div className="mt-2 text-white/80">
                  Answer: <span className="font-bold text-white">{answer}</span>
                </div>
                <div className="mt-4 flex items-center gap-3">
                  <button
                    type="button"
                    onClick={share}
                    className="rounded-xl bg-white px-5 py-3 text-sm font-bold text-black"
                  >
                    {copied ? "Copied" : "Share"}
                  </button>
                  <div className="text-xs text-white/50">
                    Copies a Wordle-style emoji grid to your clipboard.
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

