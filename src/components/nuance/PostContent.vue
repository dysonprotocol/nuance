<template>
  <div>
    <div ref="root" class="relative">
      <template v-for="(chunk, idx) in rendered" :key="idx">
        <component :is="chunk.type" v-bind="chunk.props" />
      </template>
      <div
        v-if="!expanded && isOverflowing"
        class="pointer-events-none absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-background to-transparent"
      />
    </div>
    <div v-if="!expanded && isOverflowing" class="m-0">
      <a class="cursor-pointer" @click="expand">Read more…</a>
    </div>
  </div>
</template>

<script setup lang="ts">
/* global HTMLElement, NodeFilter, Text, Node */
import { ref, computed, onMounted, onUpdated, defineComponent, h } from "vue";
import NuancePost from "@/components/nuance/NuancePost.vue";
import { renderMarkdownToSafeHtml } from "@/composables/useSafeMarkdown.js";

const props = defineProps<{
  content: string;
  depth: number;
  fragment?: string;
}>();

const POST_RE = /^\s*\/(\d+)(#[^\s]+)?\s*$/gm;

const root = ref<HTMLElement | null>(null);
const expanded = ref(false);
const isOverflowing = ref(false);
const COLLAPSE_HEIGHT = 300;

// Local Markdown renderer component
const MarkdownBlockComp = defineComponent({
  name: "MarkdownBlockComp",
  props: {
    raw: { type: String, required: true },
    fragment: { type: String, required: false },
  },
  setup(p) {
    const root = ref<HTMLElement | null>(null);

    function transformMagnets(input: string): string {
      const escapeMap: Record<string, string> = {
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      };
      const esc = (s: string) => s.replace(/[&<>"']/g, (c) => escapeMap[c]);
      return input.replace(/magnet:\?[^\s"'<>)]+/g, (match) => {
        const dnEnc = (match.match(/[?&]dn=([^&]+)/) || [])[1] || "";
        const xtEnc = (match.match(/[?&]xt=([^&]+)/) || [])[1] || "";
        let label = dnEnc || xtEnc || "magnet";
        try {
          label = decodeURIComponent(label);
        } catch (err) {
          console.warn("decodeURIComponent failed for magnet label", err);
        }
        const safeLabel = esc(String(label));
        const href = esc(match);
        return `<div class="magnet"><a class="magnet-name link" href="${href}" target="_blank" rel="noopener noreferrer">${safeLabel}</a> <button class="btn" type="button" disabled>Load metadata</button> <label><input type="checkbox" disabled> Auto</label><div class="filelist"></div></div>`;
      });
    }

    const html = computed(() =>
      transformMagnets(renderMarkdownToSafeHtml(p.raw || ""))
    );

    function afterRender() {
      try {
        const hljs: any = (window as any).hljs;
        if (hljs && root.value)
          root.value
            .querySelectorAll("pre code")
            .forEach((b) => hljs.highlightElement(b));
      } catch (err) {
        console.warn("Code highlighting failed", err);
      }
    }

    onMounted(afterRender);
    onUpdated(afterRender);

    return () =>
      h("div", {
        ref: (el: any) => (root.value = el as HTMLElement),
        innerHTML: html.value as unknown as string,
      });
  },
});

// Embedded renderer removed. Use NuancePost for nested posts.

const rendered = computed(() => {
  if (!props.content) return [{ type: "span", props: { innerHTML: "" } }];
  const out: Array<{ type: any; props: Record<string, unknown> }> = [];
  let lastIndex = 0;
  for (const m of props.content.matchAll(POST_RE)) {
    const full = m[0];
    const start = m.index ?? 0;
    const pre = props.content.slice(lastIndex, start);
    if (pre)
      out.push({
        type: MarkdownBlockComp,
        props: { raw: pre, fragment: props.fragment },
      });
    const id = Number(m[1]);
    const fragment = m[2] as string | undefined;
    const nextDepth = props.depth > 0 ? props.depth - 1 : 0;
    out.push({
      type: NuancePost,
      props: {
        postId: id,
        depth: nextDepth,
        fragment,
        class: "border p-4 my-4",
      },
    });
    lastIndex = start + full.length;
  }
  const tail = props.content.slice(lastIndex);
  if (tail)
    out.push({
      type: MarkdownBlockComp,
      props: { raw: tail, fragment: props.fragment },
    });
  return out;
});

function applyCollapsible() {
  const el = root.value;
  if (!el) return;
  const overflowing = el.scrollHeight > COLLAPSE_HEIGHT;
  isOverflowing.value = overflowing;
  if (!overflowing || expanded.value) {
    el.style.maxHeight = "";
    el.style.overflow = "";
    return;
  }
  el.style.maxHeight = `${COLLAPSE_HEIGHT}px`;
  el.style.overflow = "hidden";
}

function expand() {
  expanded.value = true;
  applyCollapsible();
}

function applyFragmentHighlight() {
  if (!props.fragment || !root.value) return;
  let frag = props.fragment.startsWith("#")
    ? props.fragment.slice(1)
    : props.fragment;
  if (frag.startsWith(":~:")) frag = frag.slice(3);
  let params: URLSearchParams;
  try {
    params = new URLSearchParams(frag);
  } catch (err) {
    console.warn("Invalid fragment format for highlighting", err);
    return;
  }
  const texts = params.getAll("text");
  if (!texts.length) return;
  const el = root.value;
  for (const t of texts) {
    if (!t) continue;
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    let found = false;
    while (!found && walker.nextNode()) {
      const node = walker.currentNode as Text;
      const idx = node.data.indexOf(t);
      if (idx >= 0) {
        const before = node.data.slice(0, idx);
        const match = node.data.slice(idx, idx + t.length);
        const after = node.data.slice(idx + t.length);
        const parent = node.parentNode as Node;
        const beforeNode = document.createTextNode(before);
        const mark = document.createElement("mark");
        mark.textContent = match;
        const afterNode = document.createTextNode(after);
        parent.replaceChild(afterNode, node);
        parent.insertBefore(mark, afterNode);
        parent.insertBefore(beforeNode, mark);
        found = true;
      }
    }
  }
}

function afterRender() {
  applyFragmentHighlight();
  applyCollapsible();
}

onMounted(afterRender);
onUpdated(afterRender);
</script>
