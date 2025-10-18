<template>
  <div class="w-full flex flex-col sm:flex-row gap-2">
    <Input
      id="amount"
      :value="amountDisplay"
      type="number"
      inputmode="decimal"
      min="0"
      step="0.000001"
      placeholder="Amount"
      class="w-full"
      :disabled="disabled"
      @input="onAmountInput"
    />
    <Select v-model="selectedBaseDenom" :disabled="disabled || options.length === 0">
      <SelectTrigger class="w-full sm:w-48">
        <SelectValue placeholder="Denom" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem v-for="opt in options" :key="opt.base" :value="opt.base">
          {{ opt.display }}
        </SelectItem>
      </SelectContent>
    </Select>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import { useWallet } from '@/composables/useWallet'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectTrigger,
  SelectContent,
  SelectItem,
  SelectValue,
} from '@/components/ui/select'

const props = defineProps({
  baseDenoms: { type: Array, default: () => [] },
  defaultBaseDenom: { type: String, default: '' },
  disabled: { type: Boolean, default: false },
  // Enables v-model:base from parent: { amount: string; denom: string }
  base: { type: Object, default: () => ({ amount: '', denom: '' }) },
})

const emit = defineEmits(['update:base', 'update:display'])

const { loadDenomMetadata, getDisplayOptions } = useWallet()

const amountDisplay = ref('')
const selectedBaseDenom = ref('')

const options = computed(() => getDisplayOptions({ allowedBases: props.baseDenoms }))

function initializeSelection() {
  if (props.defaultBaseDenom && options.value.some((o) => o.base === props.defaultBaseDenom)) {
    selectedBaseDenom.value = props.defaultBaseDenom
    return
  }
  selectedBaseDenom.value = options.value[0]?.base || ''
}

function computeAndEmit() {
  const opt = options.value.find((o) => o.base === selectedBaseDenom.value)
  const displayDenom = opt?.display || ''
  const amountStr = String(amountDisplay.value || '')

  // Always emit current display state
  emit('update:display', { amount: amountStr, denom: displayDenom })

  // Do not emit base-clearing updates; preserve user input on denom changes
  if (!displayDenom || amountStr === '') return

  // Convert display -> base using exponent from options (no metadata lookup ambiguity)
  const exponent = Number(opt?.exponent || 0)
  const raw = amountStr.trim()
  const hasDot = raw.includes('.')
  const [a, bRaw] = hasDot ? raw.split('.') : [raw, '']
  const frac = (bRaw || '').slice(0, exponent)
  const pad = Math.max(0, exponent - frac.length)
  const baseAmountRaw = (a || '0') + (frac + '0'.repeat(pad))
  // Remove leading zeros but keep a single zero if value is zero
  const baseAmountStr = baseAmountRaw.replace(/^0+(?!$)/, '')

  emit('update:base', {
    amount: baseAmountStr || '0',
    denom: selectedBaseDenom.value || '',
  })
}

function onAmountInput(event) {
  amountDisplay.value = event.target.value
}

watch([amountDisplay, selectedBaseDenom, () => props.baseDenoms], computeAndEmit)

watch(
  () => options.value.map((o) => o.base).join('|'),
  () => initializeSelection()
)

onMounted(async () => {
  await loadDenomMetadata()
  initializeSelection()
  computeAndEmit()
})

// React to parent-provided base value (idiomatic v-model:base)
watch(
  () => [props.base?.denom, props.base?.amount],
  () => {
    const baseDenom = String(props.base?.denom || '')
    const hasValidDenom = baseDenom && options.value.some((o) => o.base === baseDenom)
    if (hasValidDenom) selectedBaseDenom.value = baseDenom
    const exp = Number(options.value.find((o) => o.base === baseDenom)?.exponent || 0)
    const baseAmount = props.base?.amount
    if (baseAmount == null || baseAmount === '') return
    const s = String(baseAmount)
    if (exp <= 0) amountDisplay.value = s
    else if (s.length <= exp) {
      const pad = '0'.repeat(exp - s.length)
      amountDisplay.value = `0.${pad}${s}`.replace(/\.0+$/, '')
    } else {
      const i = s.length - exp
      amountDisplay.value = `${s.slice(0, i)}.${s.slice(i)}`.replace(/\.0+$/, '')
    }
    computeAndEmit()
  }
)
</script>

<style scoped></style>
