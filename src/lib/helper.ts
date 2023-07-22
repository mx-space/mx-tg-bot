export const escapeMarkdownV2 = (text: string) => {
  return text.replace(/[-.]/g, "\\$&");
};
