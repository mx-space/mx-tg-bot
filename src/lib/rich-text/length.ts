export const TG_TEXT_MAX = 4096;
export const TG_CAPTION_MAX = 1024;

const ELLIPSIS = "…";

export const truncateWithEllipsis = (input: string, max: number): string => {
  if (input.length <= max) return input;
  if (max <= 1) return input.slice(0, max);
  return input.slice(0, max - 1) + ELLIPSIS;
};
