import type { Telegraf } from 'telegraf'

export const extendTgBotEvent = (tgBot: Telegraf) => {
  const rawOn = tgBot.on

  const eventsMap = new Map<string, Function[]>()
  // @ts-ignore
  tgBot.on = (event: string, fns: Function) => {
    const events = eventsMap.get(event) || []
    if (events.length === 0) {
      rawOn(event as any, (ctx) => {
        events.forEach((fn) => fn(ctx))
      })
    }
    eventsMap.set(event, [...events, fns])
  }
}
