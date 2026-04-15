/** Shared software list for submissions and admin batch publish. */
export const SOFTWARE_OPTIONS = [
  "Photoshop",
  "Illustrator",
  "Figma",
  "Procreate",
  "Affinity Designer",
  "Canva",
  "After Effects",
  "Cinema 4D",
  "Other",
] as const;

export type SoftwareOption = (typeof SOFTWARE_OPTIONS)[number];

const LAYER_COUNT_GUIDANCE: Record<SoftwareOption, string> = {
  Photoshop:
    "Count all visible layers in the Layers panel (admin: upload PSD for auto-count)",
  Illustrator: "Count all layers and sublayers in the Layers panel",
  Figma: "Count all frames, components, and layers in the Layers panel",
  Procreate: "Count all layers visible in the Layers panel",
  "Affinity Designer": "Count all layers in the Layers panel",
  Canva: "Count all distinct elements on the canvas",
  "After Effects": "Count all layers visible in the Timeline",
  "Cinema 4D": "Count all objects visible in the Object Manager",
  Other: "Count all distinct layers or elements in your software",
};

export function layerCountGuidanceForSoftware(software: SoftwareOption): string {
  return LAYER_COUNT_GUIDANCE[software];
}
