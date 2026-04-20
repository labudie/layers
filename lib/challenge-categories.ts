/** Shared category list for submissions and admin flows. */
export const CATEGORY_OPTIONS = [
  "Branding",
  "UI Design",
  "Print",
  "Marketing",
  "Motion",
  "3D",
  "Other",
] as const;

export type CategoryOption = (typeof CATEGORY_OPTIONS)[number];
