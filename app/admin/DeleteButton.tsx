"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";

export function DeleteButton({ id }: { id: string }) {
  const [deleting, setDeleting] = useState(false);

  async function onDelete() {
    if (!id) return;
    setDeleting(true);
    try {
      const { error } = await supabase()
        .from("challenges")
        .delete()
        .eq("id", id);

      if (error) {
        console.error("[admin][delete] supabase delete error", error);
      }
    } catch (e) {
      console.error("[admin][delete] unexpected error", e);
    } finally {
      window.location.reload();
    }
  }

  return (
    <button
      type="button"
      onClick={() => void onDelete()}
      disabled={deleting}
      className="rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-xs font-semibold text-white hover:bg-white/10 disabled:opacity-50"
    >
      {deleting ? "Deleting..." : "Delete"}
    </button>
  );
}

