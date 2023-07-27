/// <reference types="node" />

import type { EventEmitter } from 'events'
import type { IncomingMessage, ServerResponse } from 'http'

interface CreateHandlerOptions {
  path: string
  secret: string
  events?: string | string[]
}

interface handler extends EventEmitter {
  (
    req: IncomingMessage,
    res: ServerResponse,
    callback: (err: Error) => void,
  ): void
}

declare function createHandler(
  options: CreateHandlerOptions | CreateHandlerOptions[],
): handler

export = createHandler
