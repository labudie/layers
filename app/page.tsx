import { supabase } from "@/lib/supabase";

type Challenge = {
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

  const challenge = error ? null : data;

  return (
    <main
      style={{
        backgroundColor: "black",
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "0 24px",
        textAlign: "center",
      }}
    >
      {!challenge ? (
        <>
          <h1
            style={{
              color: "white",
              fontSize: "64px",
              fontWeight: 800,
              margin: 0,
              lineHeight: 1.1,
            }}
          >
            No challenge today
          </h1>
        </>
      ) : (
        <>
          <h1
            style={{
              color: "white",
              fontSize: "64px",
              fontWeight: 800,
              margin: 0,
              lineHeight: 1.1,
            }}
          >
            {challenge.title ?? "Layers"}
          </h1>

          <div style={{ marginTop: "18px", color: "rgba(255,255,255,0.8)" }}>
            <div
              style={{
                display: "grid",
                gap: "8px",
                fontSize: "18px",
              }}
            >
              <div>Day #{challenge.day_number ?? "—"}</div>
              <div>Software: {challenge.software ?? "—"}</div>
              <div>Category: {challenge.category ?? "—"}</div>
              <div>Layers: {challenge.layer_count ?? "—"}</div>
            </div>
          </div>
        </>
      )}
    </main>
  );
}