const MAX_TRACKED_COMMENT_REPLIES = 200;
const COMMENT_REPLY_TARGET_TTL = 1000 * 60 * 60 * 24;

interface CommentReplyTarget {
  commentId: string;
  expiresAt: number;
}

const trackedCommentReplies = new Map<string, CommentReplyTarget>();

const getTrackingKey = (chatId: number, messageId: number) => {
  return `${chatId}:${messageId}`;
};

const pruneExpiredCommentReplyTargets = (now = Date.now()) => {
  for (const [key, target] of Array.from(trackedCommentReplies.entries())) {
    if (target.expiresAt <= now) {
      trackedCommentReplies.delete(key);
    }
  }
};

export const trackCommentReplyTarget = (
  chatId: number,
  messageId: number,
  commentId: string,
) => {
  const now = Date.now();
  pruneExpiredCommentReplyTargets(now);

  if (trackedCommentReplies.size >= MAX_TRACKED_COMMENT_REPLIES) {
    const oldestKey = trackedCommentReplies.keys().next().value;
    if (oldestKey) {
      trackedCommentReplies.delete(oldestKey);
    }
  }

  trackedCommentReplies.set(getTrackingKey(chatId, messageId), {
    commentId,
    expiresAt: now + COMMENT_REPLY_TARGET_TTL,
  });
};

export const getCommentReplyTarget = (chatId: number, messageId: number) => {
  const now = Date.now();
  pruneExpiredCommentReplyTargets(now);

  const key = getTrackingKey(chatId, messageId);
  const target = trackedCommentReplies.get(key);
  if (!target) {
    return;
  }

  if (target.expiresAt <= now) {
    trackedCommentReplies.delete(key);
    return;
  }

  return target.commentId;
};
