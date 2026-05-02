import { nextEasternYmd } from "@/lib/admin-eastern-dates";

export type StudioSocialChallengeSlot = {
  title: string | null;
  layer_count: number;
  image_url: string | null;
  position: number;
  creator_name: string | null;
};

export type StudioSocialDayCard = {
  dateYmd: string;
  slots: [
    StudioSocialChallengeSlot | null,
    StudioSocialChallengeSlot | null,
    StudioSocialChallengeSlot | null,
    StudioSocialChallengeSlot | null,
    StudioSocialChallengeSlot | null,
  ];
};

export type StudioSocialChallengeRowInput = {
  active_date: string | null;
  position: number | null;
  title: string | null;
  layer_count: number | null;
  image_url: string | null;
  creator_name: string | null;
};

function easternDatesInclusive(startYmd: string, endYmd: string): string[] {
  const out: string[] = [];
  let cur = startYmd;
  for (;;) {
    out.push(cur);
    if (cur === endYmd) break;
    cur = nextEasternYmd(cur);
  }
  return out;
}

/** Every Eastern calendar day from start through end, each with up to five ordered slots (may be null). */
export function groupChallengesIntoSocialDayCards(
  rows: StudioSocialChallengeRowInput[],
  startYmd: string,
  endYmd: string,
): StudioSocialDayCard[] {
  const byDate = new Map<string, Map<number, StudioSocialChallengeSlot>>();
  for (const r of rows) {
    const d = r.active_date;
    const pos = Number(r.position ?? 0);
    if (!d || pos < 1 || pos > 5) continue;
    let m = byDate.get(d);
    if (!m) {
      m = new Map();
      byDate.set(d, m);
    }
    m.set(pos, {
      title: r.title,
      layer_count: Math.max(0, Math.trunc(Number(r.layer_count ?? 0))),
      image_url: (r.image_url != null ? String(r.image_url).trim() : null) || null,
      position: pos,
      creator_name: r.creator_name,
    });
  }

  return easternDatesInclusive(startYmd, endYmd).map((dateYmd) => {
    const m = byDate.get(dateYmd);
    const slots: StudioSocialDayCard["slots"] = [
      m?.get(1) ?? null,
      m?.get(2) ?? null,
      m?.get(3) ?? null,
      m?.get(4) ?? null,
      m?.get(5) ?? null,
    ];
    return { dateYmd, slots };
  });
}
