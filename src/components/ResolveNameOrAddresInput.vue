<template>
  <div class="w-full">
    <div class="join w-full">
      <input
        ref="inputEl"
        :value="localText"
        type="text"
        placeholder="dys2... or name"
        class="input join-item w-full"
        :class="{ 'input-error': !!err }"
        :disabled="disabled"
        spellcheck="false"
        @input="onInput"
        @focus="isFocused = true"
        @blur="isFocused = false"
      >
      <div
        v-if="!!localText && !isBech32(localText)"
        class="join-item input bg-base-300"
        style="width: 3.5rem"
      >
        .dys
      </div>
    </div>
    <div class="mt-1 flex items-center gap-2 min-h-[1.25rem]">
      <span
        v-if="isResolving"
        class="opacity-70"
      >Resolving…</span>
      <span
        v-else-if="err"
        class="text-error"
      >{{ err }}</span>
      <span
        v-else-if="resolvedAddress && chosenName"
        class="text-success"
      >{{ nameMain }} resolves to:
        <AddressDisplay
          :address="resolvedAddress"
          :truncate="0"
        />
      </span>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, inject, watch, nextTick } from 'vue'
import AddressDisplay from '@/components/AddressDisplay.vue'

const props = defineProps({
  modelValue: { type: String, default: '' },
  text: { type: String, default: '' },
  disabled: { type: Boolean, default: false },
})
const emit = defineEmits(['update:modelValue', 'update:text'])

const chainInfo = inject('chainInfo', { restUrl: '' })

const inputEl = ref(null)
const localText = ref('')
const isResolving = ref(false)
const err = ref('')
const isFocused = ref(false)
let lastSelectionStart = null
let lastSelectionEnd = null

const isBech32 = (v) => v.startsWith('dys')
const resolvedAddress = ref('')
const canResolve = computed(
  () => !!(localText.value && localText.value.trim()) && !isBech32(localText.value)
)

// Name handling similar to RegisterName.vue step 1
const NameRegex = /^[a-z]([-a-z0-9]*[a-z0-9])?\.dys$/
const nameMain = computed(() =>
  String(localText.value || '')
    .trim()
    .toLowerCase()
    .replace(/\.dys$/, '')
)
const chosenName = computed(() =>
  nameMain.value && !isBech32(localText.value) ? `${nameMain.value}.dys` : ''
)

watch(
  () => props.text,
  (v) => {
    const s = String(v || '')
    if (isBech32(s)) {
      if (s !== localText.value) localText.value = s
      return
    }
    const normalized = s.toLowerCase().replace(/\.dys$/, '')
    if (normalized !== localText.value) localText.value = normalized
  },
  { immediate: true }
)

function onInput(e) {
  err.value = ''
  const v = e.target.value.trim()
  localText.value = v
  emit('update:text', v)
  // If input is an address, accept unchanged
  if (isBech32(v)) {
    resolvedAddress.value = v
    emit('update:modelValue', v)
    return
  }
  // Treat as name main; strip trailing .dys if user typed it; lower-case
  const lower = v.toLowerCase()
  const main = lower.replace(/\.dys$/, '')
  localText.value = main
  resolvedAddress.value = ''
  emit('update:modelValue', '')
  emit('update:text', main)
}

let nameCheckTimer = null
let nameCheckToken = 0
async function doResolve(nowToken) {
  err.value = ''
  isResolving.value = true
  try {
    // capture caret/selection and focus state before async work
    const hadFocus = inputEl.value && document.activeElement === inputEl.value
    if (inputEl.value) {
      lastSelectionStart = inputEl.value.selectionStart
      lastSelectionEnd = inputEl.value.selectionEnd
    }
    const q = encodeURIComponent(chosenName.value.trim())
    const url = `${chainInfo.restUrl}/dysonprotocol/nameservice/v1/resolve_name/${q}`
    const r = await fetch(url)
    const text = await r.text()
    let j = null
    try {
      j = text ? JSON.parse(text) : null
    } catch {}
    const notResolvedMsg = `${chosenName.value} did not resolve to an address`
    if (!r.ok) {
      if (nowToken === nameCheckToken) {
        err.value = notResolvedMsg
        resolvedAddress.value = ''
        emit('update:modelValue', '')
      }
      return
    }
    if (!j) throw new Error('Empty response')
    const addr = String(j?.address || '')
    if (!isBech32(addr)) throw new Error(notResolvedMsg)
    if (nowToken === nameCheckToken) {
      resolvedAddress.value = addr
      emit('update:modelValue', addr)
    }
  } catch (e) {
    const notResolvedMsg = `${chosenName.value} did not resolve to an address`
    if (nowToken === nameCheckToken) {
      err.value = e?.message || notResolvedMsg
      if (err.value !== notResolvedMsg) err.value = notResolvedMsg
      resolvedAddress.value = ''
      emit('update:modelValue', '')
    }
  } finally {
    isResolving.value = false
    // restore focus and caret if the user was typing
    await nextTick()
    if (isFocused.value && inputEl.value) {
      inputEl.value.focus()
      if (
        lastSelectionStart !== null &&
        lastSelectionEnd !== null &&
        typeof inputEl.value.setSelectionRange === 'function'
      ) {
        try {
          inputEl.value.setSelectionRange(lastSelectionStart, lastSelectionEnd)
        } catch {}
      }
    }
  }
}

function resolveNow() {
  if (!canResolve.value) return
  if (isResolving.value) return

  if (!chosenName.value) return
  nameCheckToken++
  doResolve(nameCheckToken)
}

watch(
  () => chosenName.value,
  () => {
    if (nameCheckTimer) clearTimeout(nameCheckTimer)
    if (!chosenName.value) return
    err.value = ''
    resolvedAddress.value = ''
    emit('update:modelValue', '')
    const myToken = ++nameCheckToken
    nameCheckTimer = setTimeout(() => doResolve(myToken), 500)
  }
)
</script>

<style scoped></style>
