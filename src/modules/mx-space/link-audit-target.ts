const MAX_TRACKED_LINK_AUDITS = 200;
const LINK_AUDIT_TARGET_TTL = 1000 * 60 * 60 * 24;

interface LinkAuditTarget {
  linkId: string;
  originalChatId: number;
  originalMessageId: number;
  originalIsPhoto: boolean;
  originalCaption: string;
  expiresAt: number;
}

const trackedLinkAudits = new Map<string, LinkAuditTarget>();

const getTrackingKey = (chatId: number, messageId: number) => {
  return `${chatId}:${messageId}`;
};

const pruneExpired = (now = Date.now()) => {
  for (const [key, target] of Array.from(trackedLinkAudits.entries())) {
    if (target.expiresAt <= now) {
      trackedLinkAudits.delete(key);
    }
  }
};

export const trackLinkAuditTarget = (
  chatId: number,
  messageId: number,
  target: Omit<LinkAuditTarget, "expiresAt">,
) => {
  const now = Date.now();
  pruneExpired(now);

  if (trackedLinkAudits.size >= MAX_TRACKED_LINK_AUDITS) {
    const oldestKey = trackedLinkAudits.keys().next().value;
    if (oldestKey) {
      trackedLinkAudits.delete(oldestKey);
    }
  }

  trackedLinkAudits.set(getTrackingKey(chatId, messageId), {
    ...target,
    expiresAt: now + LINK_AUDIT_TARGET_TTL,
  });
};

export const getLinkAuditTarget = (chatId: number, messageId: number) => {
  const now = Date.now();
  pruneExpired(now);

  const key = getTrackingKey(chatId, messageId);
  const target = trackedLinkAudits.get(key);
  if (!target) {
    return;
  }

  if (target.expiresAt <= now) {
    trackedLinkAudits.delete(key);
    return;
  }

  return target;
};

export const consumeLinkAuditTarget = (chatId: number, messageId: number) => {
  const target = getLinkAuditTarget(chatId, messageId);
  if (target) {
    trackedLinkAudits.delete(getTrackingKey(chatId, messageId));
  }
  return target;
};
