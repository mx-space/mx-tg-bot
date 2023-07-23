import type {
  CategoryModel,
  NoteModel,
  PageModel,
  PostModel,
} from '@mx-space/api-client'

import { getMxSpaceAggregateData } from './data'

export async function urlBuilder(path = '') {
  // if (isDev) return new URL(path, 'http://localhost:2323')

  const aggregate = await getMxSpaceAggregateData()
  return new URL(path, aggregate?.url.webUrl)
}

function isPostModel(model: any): model is PostModel {
  return (
    isDefined(model.title) && isDefined(model.slug) && !isDefined(model.order)
  )
}

function isPageModel(model: any): model is PageModel {
  return (
    isDefined(model.title) && isDefined(model.slug) && isDefined(model.order)
  )
}

function isNoteModel(model: any): model is NoteModel {
  return isDefined(model.title) && isDefined(model.nid)
}

function buildUrl(model: PostModel | NoteModel | PageModel) {
  if (isPostModel(model)) {
    // TODO
    if (!model.category) {
      console.error('PostModel.category is missing!!!!!')
      return '#'
    }
    return `/posts/${
      (model.category as CategoryModel).slug
    }/${encodeURIComponent(model.slug)}`
  } else if (isPageModel(model)) {
    return `/${model.slug}`
  } else if (isNoteModel(model)) {
    return `/notes/${model.nid}`
  }

  return '/'
}

function isDefined(data: any) {
  return data !== undefined && data !== null
}

urlBuilder.build = async (model: Parameters<typeof buildUrl>[0]) => {
  return urlBuilder(buildUrl(model)).then((r) => r.toString())
}
