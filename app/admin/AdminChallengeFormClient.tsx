"use client";

import { useFormState, useFormStatus } from "react-dom";
import { useState } from "react";

type AddChallengeState = {
  error: string | null;
};

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

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full rounded-xl bg-white px-5 py-3 text-sm font-bold text-black hover:opacity-95 disabled:opacity-50"
    >
      {pending ? "Adding..." : "Add Challenge"}
    </button>
  );
}

export function AdminChallengeFormClient({
  today,
  action,
  initialState,
}: {
  today: string;
  action: (prevState: AddChallengeState, formData: FormData) => Promise<AddChallengeState>;
  initialState: AddChallengeState;
}) {
  const [state, formAction] = useFormState(action, initialState);
  const [isSponsoredChecked, setIsSponsoredChecked] = useState(false);

  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
      <div className="text-lg font-extrabold">Add new challenge</div>

      <form action={formAction} className="mt-5 space-y-4">
        <div>
          <label className="text-sm font-semibold text-white/80">Title</label>
          <input
            name="title"
            type="text"
            required
            className="mt-1 w-full rounded-xl border border-white/15 bg-black/40 px-4 py-3 text-white outline-none"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="text-sm font-semibold text-white/80">Software</label>
            <select
              name="software"
              required
              className="mt-1 w-full rounded-xl border border-white/15 bg-black/40 px-4 py-3 text-white outline-none"
              defaultValue={SOFTWARE_OPTIONS[0]}
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
              name="category"
              required
              className="mt-1 w-full rounded-xl border border-white/15 bg-black/40 px-4 py-3 text-white outline-none"
              defaultValue={CATEGORY_OPTIONS[0]}
            >
              {CATEGORY_OPTIONS.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="text-sm font-semibold text-white/80">Layer Count</label>
            <input
              name="layer_count"
              type="number"
              required
              min={0}
              className="mt-1 w-full rounded-xl border border-white/15 bg-black/40 px-4 py-3 text-white outline-none"
            />
          </div>

          <div>
            <label className="text-sm font-semibold text-white/80">Active Date</label>
            <input
              name="active_date"
              type="date"
              required
              defaultValue={today}
              className="mt-1 w-full rounded-xl border border-white/15 bg-black/40 px-4 py-3 text-white outline-none"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="text-sm font-semibold text-white/80">
              Day Number
            </label>
            <input
              name="day_number"
              type="number"
              required
              min={1}
              className="mt-1 w-full rounded-xl border border-white/15 bg-black/40 px-4 py-3 text-white outline-none"
            />
          </div>

          <div>
            <label className="text-sm font-semibold text-white/80">
              Position (1-5)
            </label>
            <input
              name="position"
              type="number"
              required
              min={1}
              max={5}
              className="mt-1 w-full rounded-xl border border-white/15 bg-black/40 px-4 py-3 text-white outline-none"
            />
          </div>
        </div>

        <div className="flex items-center gap-3">
          <input
            id="is_sponsored"
            name="is_sponsored"
            type="checkbox"
            value="true"
            className="peer h-4 w-4 cursor-pointer"
            onChange={(e) => setIsSponsoredChecked(e.target.checked)}
          />
          <label
            htmlFor="is_sponsored"
            className="text-sm font-semibold text-white/80 cursor-pointer"
          >
            Is Sponsored
          </label>
        </div>

        {isSponsoredChecked ? (
          <div>
          <label
            className="text-sm font-semibold text-white/80"
            htmlFor="sponsor_name"
          >
            Sponsor Name
          </label>
          <input
            id="sponsor_name"
            name="sponsor_name"
            type="text"
            className="mt-1 w-full rounded-xl border border-white/15 bg-black/40 px-4 py-3 text-white outline-none"
          />
          <div className="mt-1 text-xs text-white/55">
            Required when “Is Sponsored” is checked.
          </div>
          </div>
        ) : null}

        {state.error ? (
          <p className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-100">
            {state.error}
          </p>
        ) : null}

        <SubmitButton />
      </form>
    </div>
  );
}

