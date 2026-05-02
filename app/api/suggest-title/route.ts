import Anthropic from "@anthropic-ai/sdk";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase";
import { isStudioAdminSession } from "@/lib/studio-admin";

const ALLOWED_MEDIA = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);

export async function POST(req: NextRequest) {
  const cookieStore = await cookies();
  const sb = createSupabaseServerClient(cookieStore);
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!(await isStudioAdminSession(sb, user))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey?.trim()) {
    return NextResponse.json({ error: "Title suggestion is not configured." }, { status: 503 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const imageBase64 =
    body && typeof body === "object" && "imageBase64" in body && typeof (body as { imageBase64: unknown }).imageBase64 === "string"
      ? (body as { imageBase64: string }).imageBase64
      : null;
  const mediaType =
    body && typeof body === "object" && "mediaType" in body && typeof (body as { mediaType: unknown }).mediaType === "string"
      ? (body as { mediaType: string }).mediaType
      : null;

  if (!imageBase64 || !mediaType || !ALLOWED_MEDIA.has(mediaType)) {
    return NextResponse.json({ error: "Invalid image payload." }, { status: 400 });
  }

  const client = new Anthropic({ apiKey });

  try {
    const response = await client.messages.create({
      model: "claude-opus-4-5",
      max_tokens: 50,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: {
                type: "base64",
                media_type: mediaType as "image/png" | "image/jpeg" | "image/webp" | "image/gif",
                data: imageBase64,
              },
            },
            {
              type: "text",
              text: "This is a graphic design file. Suggest a short descriptive title for it in 4 words or less. Return only the title, no punctuation, no explanation.",
            },
          ],
        },
      ],
    });

    const first = response.content[0];
    const title = first && first.type === "text" ? first.text.trim() : "";
    return NextResponse.json({ title });
  } catch (e) {
    console.error("[suggest-title]", e);
    return NextResponse.json({ error: "Suggestion failed." }, { status: 502 });
  }
}
