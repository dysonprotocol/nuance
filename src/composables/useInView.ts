import { onBeforeUnmount, onMounted, ref, type Ref } from "vue";

export function useInView(cb: () => void, options?: IntersectionObserverInit) {
  const el: Ref<HTMLElement | null> = ref(null);
  let io: IntersectionObserver | null = null;

  onMounted(() => {
    io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        try {
          cb();
        } finally {
          io?.disconnect();
        }
      }
    }, options);
    if (el.value) io.observe(el.value);
  });

  onBeforeUnmount(() => io?.disconnect());

  return el;
}
