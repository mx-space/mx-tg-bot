const MAX_TRACKED_COMMENT_REPLIES = 200;

const trackedCommentReplies = new Map<string, string>();

const getTrackingKey = (chatId: number, messageId: number) => {
  return `${chatId}:${messageId}`;
};

export const trackCommentReplyTarget = (
  chatId: number,
  messageId: number,
  commentId: string,
) => {
  if (trackedCommentReplies.size >= MAX_TRACKED_COMMENT_REPLIES) {
    const oldestKey = trackedCommentReplies.keys().next().value;
    if (oldestKey) {
      trackedCommentReplies.delete(oldestKey);
    }
  }

  trackedCommentReplies.set(getTrackingKey(chatId, messageId), commentId);
};

export const getCommentReplyTarget = (chatId: number, messageId: number) => {
  return trackedCommentReplies.get(getTrackingKey(chatId, messageId));
};
