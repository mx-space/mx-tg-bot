import { appConfig } from "~/app.config";
import type { NoteModel, PageModel, PostModel } from "@mx-space/api-client";
import { CollectionRefTypes, type BusinessEvents } from "@mx-space/webhook";
import { Markup } from "telegraf";
import { md, richify } from "~/lib/rich-text";
import type { Sendable } from "~/lib/sendable";

import { relativeTimeFromNow } from "~/lib/time";

import { apiClient } from "../api-client";
import { trackCommentReplyTarget } from "../comment-reply-target";
import { urlBuilder } from "../utils";

import type {
  CommentEventPayload,
  MxEventHandler,
  MxEventRuntime,
} from "./types";

type CommentRefModel = PostModel | NoteModel | PageModel;

interface CommentDeliveryContext {
  payload: CommentEventPayload;
  message: string;
  sendable: Sendable;
  url?: string;
}

const getCommentRefId = (payload: CommentEventPayload) => payload.refId;

const resolveCommentRef = async (
  payload: CommentEventPayload,
): Promise<CommentRefModel | null> => {
  const refId = getCommentRefId(payload);
  if (!refId) return null;

  switch (payload.refType) {
    case CollectionRefTypes.Post:
      return apiClient.post.getPost(refId);
    case CollectionRefTypes.Note:
      return apiClient.note.getNoteById(refId);
    case CollectionRefTypes.Page:
      return apiClient.page.getById(refId);
    default:
      return null;
  }
};

const buildCommentMessage = (
  payload: CommentEventPayload,
  refModel: CommentRefModel,
  ownerName: string,
  ownerUsername?: string,
) => {
  const { author, text } = payload;
  const parent = "parent" in payload ? payload.parent : undefined;
  const isMaster = author === ownerName || author === ownerUsername;
  const title = refModel.title;

  if (isMaster && !parent) {
    const ago = relativeTimeFromNow(refModel.created);
    return richify`${author} 在「${title}」发表之后的 ${ago}又说：${md(text)}`;
  }

  return richify`${author} 在「${title}」发表了评论：${md(text)}`;
};

const buildCommentSendable = (html: string, url?: string): Sendable => {
  const sendable: Sendable = [
    {
      type: "HTML",
      content: html,
    },
  ];

  if (url) {
    sendable.push({
      type: "url",
      url,
      label: "查看",
    });
  }

  return sendable;
};

const sendCommentToOwner = async (
  runtime: MxEventRuntime,
  delivery: CommentDeliveryContext,
) => {
  const sentMessage = await runtime.ctx.tgBot.telegram.sendMessage(
    appConfig.ownerId,
    delivery.message,
    {
      parse_mode: "HTML",
      ...(delivery.url
        ? Markup.inlineKeyboard([Markup.button.url("查看", delivery.url)])
        : {}),
    },
  );

  trackCommentReplyTarget(
    appConfig.ownerId,
    sentMessage.message_id,
    delivery.payload.id,
  );
};

const deliverAdminComment = async (
  runtime: MxEventRuntime,
  delivery: CommentDeliveryContext,
) => {
  await sendCommentToOwner(runtime, delivery);
};

const deliverVisitorComment = async (
  runtime: MxEventRuntime,
  delivery: CommentDeliveryContext,
  siteTitle: string,
) => {
  if (delivery.payload.isWhispers) {
    await runtime.sendToGroup(
      `「${siteTitle}」嘘，有人说了一句悄悄话。是什么呢`,
    );
    await sendCommentToOwner(runtime, delivery);
    return;
  }

  await runtime.sendToGroup(delivery.sendable);
};

export const handleCommentCreate: MxEventHandler<
  BusinessEvents.COMMENT_CREATE
> = async (runtime, payload) => {
  const aggregateData = await runtime.getAggregateData();
  const refId = getCommentRefId(payload);
  const refModel = await resolveCommentRef(payload);
  if (!refModel) {
    runtime.logger.error(`[comment]: ref model not found, refId: ${refId}`);
    return;
  }

  const message = buildCommentMessage(
    payload,
    refModel,
    aggregateData.user.name,
    aggregateData.user.username,
  );

  const resolvedUrl = await urlBuilder.build(refModel);
  const url = resolvedUrl !== "#" ? resolvedUrl : undefined;
  const delivery: CommentDeliveryContext = {
    payload,
    message,
    sendable: buildCommentSendable(message, url),
    url,
  };

  if (runtime.source === "admin") {
    await deliverAdminComment(runtime, delivery);
    return;
  }

  await deliverVisitorComment(runtime, delivery, aggregateData.seo.title);
};
