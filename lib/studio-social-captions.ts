export type SocialCaptionChallenge = {
  position: number;
  title: string | null;
  layer_count: number;
};

/** UI labels for the 6 rotating styles (T+1 posting: numbers = previous day, copy drives today). */
export const SOCIAL_CAPTION_STYLE_LABELS = [
  "Shock",
  "Relatability",
  "Contrast",
  "Community",
  "Designer POV",
  "Dare",
] as const;

export type SocialCaptionsBundle = {
  styleIndex: number;
  styleLabel: string;
  x: string;
  instagram: string;
  tiktok: string;
};

/**
 * T+1 captions: `priorDayChallenges` should be the **previous Eastern calendar day's**
 * five slots (positions 1 & 5 used for easy/expert title + layer counts). When absent
 * (e.g. first day of range), placeholders are used.
 * `dayIndex` should incorporate any per-day regenerate offset (see caller).
 */
export function getCaptions(
  priorDayChallenges: SocialCaptionChallenge[] | null,
  dayIndex: number,
): SocialCaptionsBundle {
  const styleIndex = ((dayIndex % 6) + 6) % 6;
  const styleLabel = SOCIAL_CAPTION_STYLE_LABELS[styleIndex];

  const list = priorDayChallenges ?? [];
  const expertChallenge = list.find((c) => c.position === 5);
  const easyChallenge = list.find((c) => c.position === 1);
  const expertTitle = expertChallenge?.title?.trim() || "[Yesterday's expert challenge]";
  const expertLayers = expertChallenge?.layer_count ?? 0;
  const easyLayers = easyChallenge?.layer_count ?? 0;
  const halfGuess = Math.round(expertLayers * 0.5);

  switch (styleIndex) {
    case 0:
      return {
        styleIndex,
        styleLabel,
        x:
          `${expertLayers} layers. One ${expertTitle}.\n\n` +
          `Could you have guessed that?\n\n` +
          `Today's expert is live now — and we're still not telling you the count.\n\n` +
          `Play free → layersgame.com`,
        instagram:
          `${expertLayers} layers. 🤯\n\n` +
          `That's how many layers were in yesterday's expert challenge — a ${expertTitle}.\n\n` +
          `Today's expert is live. Can you guess it in 3 tries?\n\n` +
          `Play free — link in bio.\n\n` +
          `#graphicdesign #photoshop #designchallenge #layersgame #dailydesign`,
        tiktok:
          `${expertLayers} layers. In a ${expertTitle}. That was yesterday's expert challenge on Layers. Today's is live and we're not telling you a thing. layersgame.com`,
      };
    case 1:
      return {
        styleIndex,
        styleLabel,
        x:
          `Be honest — would you have guessed ${expertLayers} layers in a ${expertTitle}?\n\n` +
          `Most designers didn't.\n\n` +
          `Today's expert is live. Play free → layersgame.com`,
        instagram:
          `Be honest 👀\n\n` +
          `Would you have guessed ${expertLayers} layers in a ${expertTitle}?\n\n` +
          `Most designers guess too low. Today's expert challenge is live — 3 tries to get it.\n\n` +
          `Play free — link in bio.\n\n` +
          `#graphicdesign #adobephotoshop #designchallenge #layersgame #dailydesign`,
        tiktok:
          `Be honest — would you have guessed ${expertLayers} layers just by looking at it? Most designers didn't. Today's expert is live on Layers. layersgame.com`,
      };
    case 2:
      return {
        styleIndex,
        styleLabel,
        x:
          `Yesterday on Layers:\n\n` +
          `Easy → ${easyLayers} layers\n` +
          `Expert → ${expertLayers} layers\n\n` +
          `The gap is the game. Today's 5 challenges are live.\n\n` +
          `Play free → layersgame.com`,
        instagram:
          `Yesterday's range on Layers 👇\n\n` +
          `🟢 Easy: ${easyLayers} layers\n` +
          `🟣 Expert: ${expertLayers} layers\n\n` +
          `Think you could have spotted the difference just by looking?\n\n` +
          `Today's 5 challenges are live — play free at layersgame.com (link in bio)\n\n` +
          `#graphicdesign #photoshop #designchallenge #layersgame #dailydesign`,
        tiktok:
          `Yesterday's easy challenge: ${easyLayers} layers. Yesterday's expert: ${expertLayers} layers. Could you feel the difference just by looking? Today's game is live. layersgame.com`,
      };
    case 3:
      return {
        styleIndex,
        styleLabel,
        x:
          `We showed designers a ${expertTitle} and asked them to guess the layer count.\n\n` +
          `Most guessed under ${halfGuess}.\n\n` +
          `It was ${expertLayers}.\n\n` +
          `Today's expert is live — play free → layersgame.com`,
        instagram:
          `We showed this ${expertTitle} to designers and asked them to guess the layer count. 🤔\n\n` +
          `Most guessed under ${halfGuess}.\n\n` +
          `It was ${expertLayers} layers.\n\n` +
          `Think you would have gotten closer? Today's expert is live.\n\n` +
          `Play free — link in bio.\n\n` +
          `#graphicdesign #photoshop #designchallenge #layersgame`,
        tiktok:
          `We asked designers to guess the layer count on a ${expertTitle}. Most said under ${halfGuess}. It was ${expertLayers}. Would you have been closer? Today's is live. layersgame.com`,
      };
    case 4:
      return {
        styleIndex,
        styleLabel,
        x:
          `Yesterday's expert designer used ${expertLayers} layers to build a single ${expertTitle}.\n\n` +
          `What's your layer discipline like?\n\n` +
          `Today's 5 challenges are live.\n\n` +
          `Play free → layersgame.com`,
        instagram:
          `${expertLayers} layers. One file. One designer. 🎨\n\n` +
          `Yesterday's expert challenge was a ${expertTitle} — and the layer count says everything about how it was built.\n\n` +
          `How does your Photoshop discipline stack up? Today's challenges are live.\n\n` +
          `Play free — link in bio.\n\n` +
          `#graphicdesign #adobephotoshop #photoshop #layersgame #designchallenge`,
        tiktok:
          `Yesterday's expert used ${expertLayers} layers to build a ${expertTitle}. Are you a 20-layer designer or a 200-layer designer? Come find out on Layers. layersgame.com`,
      };
    default:
      return {
        styleIndex,
        styleLabel,
        x:
          `Yesterday's expert: ${expertLayers} layers.\n\n` +
          `Did you get it in one?\n\n` +
          `Today's is live and the leaderboard is wide open.\n\n` +
          `Play free → layersgame.com`,
        instagram:
          `Yesterday's expert had ${expertLayers} layers. 🏆\n\n` +
          `Did you guess it? The leaderboard doesn't lie.\n\n` +
          `Today's 5 challenges are live — first one to a perfect day takes the top spot.\n\n` +
          `Play free — link in bio.\n\n` +
          `#graphicdesign #photoshop #designchallenge #layersgame #dailydesign`,
        tiktok:
          `Yesterday's expert: ${expertLayers} layers. Today's is live. The leaderboard resets every day — which means right now it's wide open. Come take the top spot. layersgame.com`,
      };
  }
}
