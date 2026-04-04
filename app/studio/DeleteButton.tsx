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
      } else {
        console.log("[admin][delete] deleted challenge", id);
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
      className="rounded-xl border border-red-400/45 bg-red-500/20 px-3 py-2 text-xs font-semibold text-red-100 hover:bg-red-500/30 disabled:opacity-50"
    >
      {deleting ? "Deleting..." : "Delete"}
    </button>
  );
}

