export enum MxSocketEventTypes {
  GATEWAY_CONNECT = 'GATEWAY_CONNECT',
  GATEWAY_DISCONNECT = 'GATEWAY_DISCONNECT',

  VISITOR_ONLINE = 'VISITOR_ONLINE',
  VISITOR_OFFLINE = 'VISITOR_OFFLINE',

  AUTH_FAILED = 'AUTH_FAILED',

  COMMENT_CREATE = 'COMMENT_CREATE',

  POST_CREATE = 'POST_CREATE',
  POST_UPDATE = 'POST_UPDATE',
  POST_DELETE = 'POST_DELETE',

  NOTE_CREATE = 'NOTE_CREATE',
  NOTE_UPDATE = 'NOTE_UPDATE',
  NOTE_DELETE = 'NOTE_DELETE',

  PAGE_UPDATED = 'PAGE_UPDATED',

  SAY_CREATE = 'SAY_CREATE',
  SAY_DELETE = 'SAY_DELETE',
  SAY_UPDATE = 'SAY_UPDATE',

  RECENTLY_CREATE = 'RECENTLY_CREATE',
  RECENTLY_DELETE = 'RECENTLY_DELETE',

  LINK_APPLY = 'LINK_APPLY',

  DANMAKU_CREATE = 'DANMAKU_CREATE',
  // util
  CONTENT_REFRESH = 'CONTENT_REFRESH', // 内容更新或重置 页面需要重载
  // for admin
  IMAGE_REFRESH = 'IMAGE_REFRESH',
  IMAGE_FETCH = 'IMAGE_FETCH',

  ADMIN_NOTIFICATION = 'ADMIN_NOTIFICATION',
  STDOUT = 'STDOUT',

  PTY = 'pty',

  PTY_MESSAGE = 'pty_message',

  // activity
  ACTIVITY_LIKE = 'activity_like',
}

export enum MxSystemEventBusEvents {
  EmailInit = 'email.init',
  PushSearch = 'search.push',
  TokenExpired = 'token.expired',

  CleanAggregateCache = 'cache.aggregate',
  SystemException = 'system.exception',
}
