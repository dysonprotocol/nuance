import { marked } from "marked";
import extendedTables from "marked-extended-tables";
import DOMPurify from "dompurify";

// Configure marked for basic features; avoid HTML in markdown input
marked.setOptions({ breaks: true, gfm: true, headerIds: false, mangle: false });
marked.use(extendedTables());

const ALLOWED_TAGS = [
  "a",
  "abbr",
  "b",
  "blockquote",
  "br",
  "code",
  "del",
  "em",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "hr",
  "i",
  "img",
  "kbd",
  "li",
  "mark",
  "ol",
  "p",
  "pre",
  "s",
  "small",
  "span",
  "strong",
  "sub",
  "sup",
  "u",
  "ul",
  "table",
  "thead",
  "tbody",
  "tr",
  "th",
  "td",
];

const ALLOWED_ATTR = [
  "href",
  "title",
  "target",
  "rel",
  "src",
  "alt",
  "class",
  // table spanning & accessibility
  "colspan",
  "rowspan",
  "scope",
  // alignment from GFM tables
  "align",
];

export function renderMarkdownToSafeHtml(markdown) {
  if (typeof marked !== "function" || !DOMPurify?.sanitize)
    throw new Error("Markdown renderer not available");

  const md = String(markdown || "");
  const rawHtml = marked.parse(md);
  const cleanHtml = DOMPurify.sanitize(rawHtml, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    ADD_ATTR: ["rel"],
    FORBID_ATTR: ["style", "on*"],
    USE_PROFILES: { html: true },
  });
  return cleanHtml;
}
