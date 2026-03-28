"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { formatAtUsername, stripAtHandle } from "@/lib/username-display";

const SOFTWARE_OPTIONS = [
  "Photoshop",
  "Illustrator",
  "Figma",
  "After Effects",
  "Cinema 4D",
  "Other",
] as const;

const CATEGORY_OPTIONS = [
  "Branding",
  "UI Design",
  "Print",
  "Marketing",
  "Motion",
  "3D",
  "Other",
] as const;

type SubmissionRow = {
  id: number;
  title: string | null;
  status: "pending" | "approved" | "rejected" | null;
  created_at: string | null;
};

export default function SubmitPage() {
  const router = useRouter();
  const [userId, setUserId] = useState<string | null>(null);
  const [creatorName, setCreatorName] = useState("");
  const [title, setTitle] = useState("");
  const [software, setSoftware] = useState<(typeof SOFTWARE_OPTIONS)[number]>(
    SOFTWARE_OPTIONS[0]
  );
  const [category, setCategory] = useState<(typeof CATEGORY_OPTIONS)[number]>(
    CATEGORY_OPTIONS[0]
  );
  const [layerCount, setLayerCount] = useState<number | "">("");
  const [confirmOriginal, setConfirmOriginal] = useState(false);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [submissions, setSubmissions] = useState<SubmissionRow[]>([]);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const load = useCallback(async () => {
    const sb = supabase();
    const {
      data: { user },
    } = await sb.auth.getUser();
    if (!user) {
      router.replace("/login");
      return;
    }
    setUserId(user.id);

    const { data: profile } = await sb
      .from("profiles")
      .select("username")
      .eq("id", user.id)
      .maybeSingle();
    const username =
      (profile as { username?: string | null } | null)?.username?.trim() ?? "";
    const baseName = stripAtHandle(username) || `player_${user.id.slice(0, 8)}`;
    setCreatorName(formatAtUsername(username, `player_${user.id.slice(0, 8)}`));

    // Keep profile email mirrored for admin users table (best effort).
    await sb.from("profiles").upsert(
      {
        id: user.id,
        email: user.email ?? null,
        username: baseName,
      },
      { onConflict: "id" }
    );

    const { data: rows } = await sb
      .from("submissions")
      .select("id, title, status, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });
    setSubmissions((rows as SubmissionRow[] | null) ?? []);
  }, [router]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  function setImage(file: File) {
    if (!["image/png", "image/jpeg"].includes(file.type)) {
      setError("Please upload a PNG or JPG image.");
      return;
    }
    setImageFile(file);
    setPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return URL.createObjectURL(file);
    });
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!userId) return;
    if (!title.trim()) return setError("Title is required.");
    if (!Number.isFinite(Number(layerCount))) return setError("Layer count is required.");
    if (!imageFile) return setError("Image is required.");
    if (!confirmOriginal) {
      return setError(
        "Please confirm this layer count is accurate and this is your original work."
      );
    }

    setSubmitting(true);
    setError(null);
    setSuccess(null);
    try {
      const ext = imageFile.type === "image/jpeg" ? "jpg" : "png";
      const safeTitle = title
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 60);
      const path = `submissions/${userId}/${Date.now()}-${safeTitle || "art"}.${ext}`;
      const sb = supabase();
      const { error: uploadErr } = await sb.storage
        .from("challenge-images")
        .upload(path, imageFile, {
          contentType: imageFile.type,
          upsert: true,
        });
      if (uploadErr) {
        setError(uploadErr.message);
        return;
      }

      const { data: pub } = sb.storage.from("challenge-images").getPublicUrl(path);
      const imageUrl = pub.publicUrl;
      const { error: insertErr } = await sb.from("submissions").insert({
        user_id: userId,
        title: title.trim(),
        creator_name: creatorName.trim() || null,
        software,
        category,
        layer_count: Math.trunc(Number(layerCount)),
        image_url: imageUrl,
        status: "pending",
      });
      if (insertErr) {
        setError(insertErr.message);
        return;
      }

      setSuccess("Your work has been submitted for review!");
      setTitle("");
      setLayerCount("");
      setConfirmOriginal(false);
      setImageFile(null);
      setPreviewUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
      await load();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen w-full bg-[var(--background)] text-[var(--text)]">
      <div className="mx-auto w-full max-w-3xl px-4 py-8 md:px-5">
        <div className="mb-6 flex items-center justify-between">
          <div className="text-xl font-extrabold tracking-tight">Layers</div>
          <Link
            href="/"
            className="inline-flex items-center rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-sm font-semibold text-white hover:bg-white/10"
          >
            ← Back
          </Link>
        </div>

        <div className="rounded-2xl border border-white/10 bg-[rgba(26,10,46,0.65)] p-5">
          <h1 className="text-2xl font-extrabold">Submit Your Work</h1>
          <p className="mt-1 text-sm text-white/60">
            Share your design with the community. Approved submissions can be featured.
          </p>

          <form className="mt-5 space-y-4" onSubmit={onSubmit}>
            <div>
              <label className="text-sm font-semibold text-white/80">Creator Name</label>
              <input
                type="text"
                value={creatorName}
                onChange={(e) => setCreatorName(e.target.value)}
                className="mt-1 w-full rounded-xl border border-white/15 bg-black/40 px-4 py-3 text-white outline-none"
              />
            </div>

            <div>
              <label className="text-sm font-semibold text-white/80">Title</label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
                className="mt-1 w-full rounded-xl border border-white/15 bg-black/40 px-4 py-3 text-white outline-none"
              />
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="text-sm font-semibold text-white/80">Software</label>
                <select
                  value={software}
                  onChange={(e) =>
                    setSoftware(e.target.value as (typeof SOFTWARE_OPTIONS)[number])
                  }
                  className="mt-1 w-full rounded-xl border border-white/15 bg-black/40 px-4 py-3 text-white outline-none"
                >
                  {SOFTWARE_OPTIONS.map((opt) => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-sm font-semibold text-white/80">Category</label>
                <select
                  value={category}
                  onChange={(e) =>
                    setCategory(e.target.value as (typeof CATEGORY_OPTIONS)[number])
                  }
                  className="mt-1 w-full rounded-xl border border-white/15 bg-black/40 px-4 py-3 text-white outline-none"
                >
                  {CATEGORY_OPTIONS.map((opt) => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="text-sm font-semibold text-white/80">Layer Count</label>
              <input
                type="number"
                min={0}
                required
                value={layerCount}
                onChange={(e) => setLayerCount(e.target.value === "" ? "" : Number(e.target.value))}
                className="mt-1 w-full rounded-xl border border-white/15 bg-black/40 px-4 py-3 text-white outline-none"
              />
            </div>

            <div className="rounded-2xl border border-white/10 bg-black/25 p-4">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) setImage(file);
                  e.target.value = "";
                }}
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsDragOver(true);
                }}
                onDragLeave={() => setIsDragOver(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setIsDragOver(false);
                  const file = e.dataTransfer.files?.[0];
                  if (file) setImage(file);
                }}
                className={`flex w-full flex-col items-center justify-center rounded-xl border-2 border-dashed px-4 py-8 text-center transition ${
                  isDragOver
                    ? "border-[var(--accent)] bg-[var(--accent)]/10"
                    : "border-white/20 bg-black/30 hover:bg-black/40"
                }`}
              >
                <div className="text-2xl">⬆️</div>
                <div className="mt-2 text-sm font-semibold text-white/90">
                  Drag and drop image here
                </div>
                <div className="mt-1 text-xs text-white/55">PNG or JPG</div>
              </button>
              {previewUrl ? (
                <img
                  src={previewUrl}
                  alt="Preview"
                  className="mt-3 h-28 w-28 rounded-lg border border-white/15 object-cover"
                />
              ) : null}
            </div>

            <label className="flex items-start gap-3 rounded-xl border border-[var(--accent)]/35 bg-[var(--accent)]/10 px-4 py-3">
              <input
                type="checkbox"
                checked={confirmOriginal}
                onChange={(e) => setConfirmOriginal(e.target.checked)}
                className="mt-0.5 h-4 w-4"
              />
              <span className="text-sm font-semibold text-white">
                I confirm this layer count is accurate and this is my original work
              </span>
            </label>

            {error ? (
              <p className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-100">
                {error}
              </p>
            ) : null}
            {success ? (
              <p className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">
                {success}
              </p>
            ) : null}

            <button
              type="submit"
              disabled={submitting}
              className="w-full rounded-xl bg-[var(--accent)] px-5 py-3 text-sm font-bold text-white transition hover:bg-[var(--accent2)] disabled:opacity-50"
            >
              {submitting ? "Submitting..." : "Submit Your Work"}
            </button>
          </form>
        </div>

        <div className="mt-8 rounded-2xl border border-white/10 bg-[rgba(26,10,46,0.65)] p-5">
          <h2 className="text-lg font-extrabold">My Submissions</h2>
          {submissions.length === 0 ? (
            <p className="mt-3 text-sm text-white/60">No submissions yet.</p>
          ) : (
            <div className="mt-4 space-y-2">
              {submissions.map((s) => (
                <div
                  key={s.id}
                  className="flex items-center justify-between rounded-xl border border-white/10 bg-black/25 px-4 py-3"
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-white">
                      {s.title ?? "Untitled"}
                    </div>
                    <div className="text-xs text-white/50">
                      {s.created_at
                        ? new Date(s.created_at).toLocaleDateString("en-US", {
                            month: "short",
                            day: "numeric",
                            year: "numeric",
                          })
                        : "—"}
                    </div>
                  </div>
                  <span
                    className={`rounded-full px-3 py-1 text-xs font-semibold ${
                      s.status === "approved"
                        ? "bg-emerald-500/20 text-emerald-200"
                        : s.status === "rejected"
                          ? "bg-red-500/20 text-red-200"
                          : "bg-amber-500/20 text-amber-200"
                    }`}
                  >
                    {s.status ?? "pending"}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
