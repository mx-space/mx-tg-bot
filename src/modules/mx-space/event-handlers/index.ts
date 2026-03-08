import { BusinessEvents } from "@mx-space/webhook";

import { handleActivityLike } from "./activity-like";
import { handleCommentCreate } from "./comment-create";
import { handleLinkApply } from "./link-apply";
import { handleNoteCreate } from "./note-create";
import { handlePostCreate, handlePostUpdate } from "./post-events";
import { handleRecentlyCreate } from "./recently-create";
import { handleSayCreate } from "./say-create";
import type { MxEventHandlerMap } from "./types";

export const mxEventHandlers = {
  [BusinessEvents.POST_CREATE]: handlePostCreate,
  [BusinessEvents.POST_UPDATE]: handlePostUpdate,
  [BusinessEvents.NOTE_CREATE]: handleNoteCreate,
  [BusinessEvents.LINK_APPLY]: handleLinkApply,
  [BusinessEvents.COMMENT_CREATE]: handleCommentCreate,
  [BusinessEvents.SAY_CREATE]: handleSayCreate,
  [BusinessEvents.RECENTLY_CREATE]: handleRecentlyCreate,
  [BusinessEvents.ACTIVITY_LIKE]: handleActivityLike,
} satisfies MxEventHandlerMap;
