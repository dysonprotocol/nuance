<template>
  <span
    ref="triggerRef"
    class="inline-flex items-center"
    @mouseenter="open"
    @mouseleave="close"
    @click="openThenAutoHide"
  >
    <slot />
  </span>

  <teleport to="body">
    <div
      v-if="isOpen"
      ref="tooltipRef"
      class="fixed z-[9999] pointer-events-none select-none px-2 py-1 rounded bg-base-200 text-base-content text-xs shadow"
      :style="{ top: `${position.top}px`, left: `${position.left}px` }"
    >
      {{ text }}
    </div>
  </teleport>
</template>

<script setup>
import { nextTick, onBeforeUnmount, reactive, ref, watchEffect } from "vue";

const props = defineProps({
  text: { type: String, required: true },
  placement: { type: String, default: "top" }, // "top" | "bottom"
  offset: { type: Number, default: 8 },
  autoHideMs: { type: Number, default: 900 },
});

const isOpen = ref(false);
const triggerRef = ref(null);
const tooltipRef = ref(null);
const position = reactive({ top: -9999, left: -9999 });

let hideTimerId = null;

function open() {
  if (isOpen.value) return;
  isOpen.value = true;
  bindPositioningEvents();
  nextTick(updatePosition);
}

function close() {
  if (!isOpen.value) return;
  isOpen.value = false;
  unbindPositioningEvents();
  clearHideTimer();
}

function openThenAutoHide() {
  open();
  clearHideTimer();
  hideTimerId = setTimeout(() => close(), props.autoHideMs);
}

function clearHideTimer() {
  if (!hideTimerId) return;
  clearTimeout(hideTimerId);
  hideTimerId = null;
}

function updatePosition() {
  const triggerEl = triggerRef.value;
  const tooltipEl = tooltipRef.value;
  if (!triggerEl || !tooltipEl) return;

  const rect = triggerEl.getBoundingClientRect();
  const tipRect = tooltipEl.getBoundingClientRect();

  let top = rect.top - props.offset - tipRect.height;
  let left = rect.left + rect.width / 2 - tipRect.width / 2;

  if (props.placement === "bottom") top = rect.bottom + props.offset;

  // Clamp to viewport horizontally
  const vw = window.innerWidth;
  if (left < 4) left = 4;
  if (left + tipRect.width > vw - 4) left = Math.max(4, vw - 4 - tipRect.width);

  // Prevent going above the top edge; if so, flip to bottom
  if (top < 4) top = rect.bottom + props.offset;

  position.top = Math.round(top);
  position.left = Math.round(left);
}

function onScrollOrResize() {
  if (!isOpen.value) return;
  updatePosition();
}

function bindPositioningEvents() {
  window.addEventListener("scroll", onScrollOrResize, true);
  window.addEventListener("resize", onScrollOrResize);
}

function unbindPositioningEvents() {
  window.removeEventListener("scroll", onScrollOrResize, true);
  window.removeEventListener("resize", onScrollOrResize);
}

onBeforeUnmount(() => {
  unbindPositioningEvents();
  clearHideTimer();
});

// Recompute when text changes while open (e.g., "copied")
watchEffect(() => {
  if (isOpen.value) nextTick(updatePosition);
});
</script>

<style scoped></style>
