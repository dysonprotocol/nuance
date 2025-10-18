import { ref } from "vue";

const executorAddress = ref<string>("");

export function useExecutor() {
  return { executorAddress };
}
