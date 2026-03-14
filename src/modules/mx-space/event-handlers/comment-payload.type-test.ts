import type { BusinessEvents, EventPayloadMapping } from "@mx-space/webhook";

import type { CommentEventPayload } from "./types";

type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2
    ? true
    : false;
type Expect<T extends true> = T;

export type CommentPayloadShouldAlignWithWebhook = Expect<
  Equal<CommentEventPayload, EventPayloadMapping[BusinessEvents.COMMENT_CREATE]>
>;
