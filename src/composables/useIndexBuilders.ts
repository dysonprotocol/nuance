export function pad15(n: number): string {
  return String(n).padStart(15, "0");
}

export type Namespace = "tags" | "replies";

export function tagNameFor(
  ns: Namespace,
  args: { tag?: string; postId?: number }
): string {
  if (ns === "tags") return String(args.tag || "");
  return pad15(Number(args.postId || 0));
}

export function idxRateTagCounts(tag: string, postId: number): string {
  return `rate_tags/tags/${tag}/${pad15(postId)}`;
}

export function idxRateTagList(tag: string, sort: "hot" | "best"): string {
  return `rate/tags/${tag}/${sort}/`;
}

export function idxRateReplies(postId: number, sort: "hot" | "best"): string {
  return `rate/replies/${pad15(postId)}/${sort}/`;
}

export function idxRateReplyCounts(postId: number, replyId: number): string {
  return `rate_tags/replies/${pad15(postId)}/${pad15(replyId)}`;
}

export function idxTagRewards(tag: string): string {
  // script.py _get_tag_index(TAGS, tag) => "tag/tags/{tag}"
  return `tag/tags/${tag}`;
}

export function idxReplyRewards(postId: number): string {
  // script.py _get_tag_index(REPLIES, _format_id(postId)) => "tag/replies/{pad15(postId)}"
  return `tag/replies/${pad15(postId)}`;
}

// Generic helpers (namespace-agnostic)
export function idxRateCounts(
  ns: Namespace,
  tagName: string,
  id: number
): string {
  return `rate_tags/${ns}/${tagName}/${pad15(id)}`;
}

export function idxRateList(
  ns: Namespace,
  tagName: string,
  sort: "hot" | "best"
): string {
  return `rate/${ns}/${tagName}/${sort}/`;
}

export function idxRewards(ns: Namespace, tagName: string): string {
  return `tag/${ns}/${tagName}`;
}

export function idxFeaturedTopicsUdysPrefix(): string {
  // available_rewards/{namespace}/{denom}/{amount}/{tag}
  // We list the prefix up to denom to get all entries and sort via reverse
  return "available_rewards/tags/udys/";
}

export function idxAllTopicsPrefix(): string {
  // tag/tags/{tag}
  return "tag/tags/";
}

export function idxActiveRepliesUdysPrefix(): string {
  // available_rewards/replies/udys/{amount}/{postId}
  return "available_rewards/replies/udys/";
}
