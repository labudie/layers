export type SocialCaptionChallenge = {
  position: number;
  title: string | null;
  layer_count: number;
};

export const SOCIAL_CAPTION_STYLE_LABELS = [
  "Tease",
  "Obscured count",
  "Range hint",
  "Easy vs Expert contrast",
  "Community challenge",
  "Reveal",
] as const;

export type SocialCaptionsBundle = {
  styleIndex: number;
  styleLabel: string;
  x: string;
  instagram: string;
  tiktok: string;
};

/**
 * Rotating caption drafts for the studio Social tab.
 * `dayIndex` should incorporate any per-day regenerate offset (see caller).
 */
export function getCaptions(
  challenges: SocialCaptionChallenge[],
  dayIndex: number,
): SocialCaptionsBundle {
  const styleIndex = ((dayIndex % 6) + 6) % 6;
  const styleLabel = SOCIAL_CAPTION_STYLE_LABELS[styleIndex];

  const expertChallenge = challenges.find((c) => c.position === 5);
  const easyChallenge = challenges.find((c) => c.position === 1);
  const expertTitle = expertChallenge?.title?.trim() || "[Expert challenge]";
  const expertLayers = expertChallenge?.layer_count ?? 0;
  const easyLayers = easyChallenge?.layer_count ?? 0;

  const lowRange = Math.round(expertLayers * 0.6);
  const highRange = Math.round(expertLayers * 1.5);

  switch (styleIndex) {
    case 0:
      return {
        styleIndex,
        styleLabel,
        x:
          `Today's expert challenge: ${expertTitle}. How many layers deep do you think it goes?\n\n` +
          `Play free → layersgame.com`,
        instagram:
          `Today's expert on Layers: ${expertTitle}. 🎮\n\n` +
          `We're not telling you the layer count. You've got 3 guesses.\n\n` +
          `Play free — link in bio.\n\n` +
          `#graphicdesign #photoshop #designchallenge #layersgame #dailydesign`,
        tiktok:
          `Today's expert challenge on Layers: ${expertTitle}. How many layers do you think it took? Drop your guess below 👇 layersgame.com`,
      };
    case 1:
      return {
        styleIndex,
        styleLabel,
        x:
          `XXX layers. ${expertTitle}.\n\nYou've got 3 guesses. Play free → layersgame.com`,
        instagram:
          `XXX layers. One Photoshop file. One expert challenge. 🖥️\n\n` +
          `Can you guess the real number in 3 tries?\n\n` +
          `Play Layers free — link in bio.\n\n` +
          `#graphicdesign #adobephotoshop #designchallenge #layersgame`,
        tiktok:
          `XXX layers. That's today's expert on Layers. The real number might surprise you. Go guess → layersgame.com`,
      };
    case 2:
      return {
        styleIndex,
        styleLabel,
        x:
          `Today's expert is somewhere between ${lowRange} and ${highRange} layers.\n\n` +
          `Think you can narrow it down? → layersgame.com`,
        instagram:
          `Hint: today's expert challenge has somewhere between ${lowRange} and ${highRange} layers. 👀\n\n` +
          `That's all you're getting. 3 guesses. Play free — link in bio.\n\n` +
          `#graphicdesign #photoshop #layersgame #designchallenge`,
        tiktok:
          `I'll give you a hint — today's expert has somewhere between ${lowRange} and ${highRange} layers. Can you guess it exactly? layersgame.com`,
      };
    case 3:
      return {
        styleIndex,
        styleLabel,
        x:
          `Today on Layers:\nEasy challenge → ${easyLayers} layers\nExpert challenge → ??? layers\n\n` +
          `One of those numbers will surprise you. Play free → layersgame.com`,
        instagram:
          `Today's range on Layers:\n\n🟢 Easy: ${easyLayers} layers\n🟣 Expert: ??? layers\n\n` +
          `The gap might surprise you. 5 challenges, 3 guesses each. Play free — link in bio.\n\n` +
          `#graphicdesign #photoshop #designchallenge #layersgame #dailydesign`,
        tiktok:
          `Easy challenge today: ${easyLayers} layers. Expert challenge: ??? layers. The difference will surprise you. Come play Layers — free daily design game.`,
      };
    case 4:
      return {
        styleIndex,
        styleLabel,
        x:
          `Drop your guess below 👇\n\nHow many layers does today's expert challenge have — ${expertTitle}?\n\n` +
          `Answer at midnight. Play → layersgame.com`,
        instagram:
          `How many layers does a ${expertTitle} have? 🤔\n\n` +
          `Drop your guess in the comments — answer unlocks at midnight.\n\n` +
          `Play the full game free at layersgame.com (link in bio)\n\n` +
          `#graphicdesign #photoshop #designchallenge #layersgame`,
        tiktok:
          `Comment your guess: how many layers in today's ${expertTitle}? We'll see who's closest. Play the full game at layersgame.com`,
      };
    default:
      return {
        styleIndex,
        styleLabel,
        x:
          `${expertLayers} layers. ${expertTitle}.\n\n` +
          `That was yesterday's expert challenge on Layers. Today's is live now — think you can beat it?\n\n` +
          `Play free → layersgame.com`,
        instagram:
          `${expertLayers} layers. 🤯\n\n` +
          `That was yesterday's expert challenge — a ${expertTitle} built in Photoshop. Today's expert is live and we're not telling you the count.\n\n` +
          `Play free — link in bio.\n\n` +
          `#graphicdesign #adobephotoshop #designchallenge #layersgame #dailydesign`,
        tiktok:
          `${expertLayers} layers in a ${expertTitle}. That was yesterday's expert on Layers. Today's is live and harder. Free to play — layersgame.com`,
      };
  }
}
