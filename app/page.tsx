import { supabase } from "@/lib/supabase";
import { DailyGameClient } from "@/app/DailyGameClient";

export type Challenge = {
  title: string | null;
  day_number: number | null;
  software: string | null;
  category: string | null;
  layer_count: number | null;
};

function formatDateYYYYMMDD(date: Date) {
  return date.toISOString().slice(0, 10);
}

export default async function Home() {
  const today = formatDateYYYYMMDD(new Date());

  const { data, error } = await supabase
    .from("challenges")
    .select("title, day_number, software, category, layer_count")
    .eq("active_date", today)
    .maybeSingle<Challenge>();

  const challenge = error ? null : data ?? null;

  return <DailyGameClient challenge={challenge} today={today} />;
}