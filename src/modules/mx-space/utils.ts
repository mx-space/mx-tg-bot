import { getMxSpaceAggregateData } from "./data";

export async function urlBuilder(path = "") {
  // if (isDev) return new URL(path, 'http://localhost:2323')

  const aggregate = await getMxSpaceAggregateData();
  return new URL(path, aggregate?.url.webUrl);
}

interface UrlBuildableModel {
  title?: string;
  slug?: string | null;
  nid?: number;
  order?: number;
  category?: { slug?: string } | string | null;
}

function isPostShape(model: UrlBuildableModel) {
  return (
    isDefined(model.title) && isDefined(model.slug) && !isDefined(model.order)
  );
}

function isPageShape(model: UrlBuildableModel) {
  return (
    isDefined(model.title) && isDefined(model.slug) && isDefined(model.order)
  );
}

function isNoteShape(model: UrlBuildableModel) {
  return isDefined(model.title) && isDefined(model.nid);
}

function buildUrl(model: UrlBuildableModel) {
  if (isNoteShape(model)) {
    return `/notes/${model.nid}`;
  } else if (isPostShape(model)) {
    const categorySlug =
      typeof model.category === "object"
        ? model.category?.slug
        : model.category;
    if (!categorySlug || !model.slug) {
      console.error("PostModel.category is missing!!!!!");
      return "#";
    }
    return `/posts/${categorySlug}/${encodeURIComponent(model.slug)}`;
  } else if (isPageShape(model)) {
    return `/${model.slug}`;
  }

  return "/";
}

function isDefined(data: any) {
  return data !== undefined && data !== null;
}

urlBuilder.build = async (model: Parameters<typeof buildUrl>[0]) => {
  return urlBuilder(buildUrl(model)).then((r) => r.toString());
};
