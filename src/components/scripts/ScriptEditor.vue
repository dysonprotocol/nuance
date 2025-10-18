<template>
  <div class="script-editor flex flex-col h-full space-y-4">
    <div class="flex justify-between items-center">
      <div class="flex gap-2 items-center">
        <div class="flex gap-2 items-center">
          <Button v-if="canEdit" :disabled="isSaving || !hasChanges" @click="save">
            {{ isSaving ? 'Saving…' : 'Save' }}
          </Button>

          <WalletSelector
            v-model="selectedEditorExecutor"
            :allowed-addresses="[props.address]"
            :default-address="props.address"
            :msg-type-filter="editorMsgTypeFilter"
            @update:executor-address="onEditorExecutor"
            @update:grantee-address="onEditorGrantee"
            @update:is-authz="onEditorIsAuthz"
            @update:authz-notes="onEditorAuthzNotes"
            @update:selected-grant="onEditorSelectedGrant"
          />
        </div>

        <div v-if="errorMessage" class="text-destructive ml-2">
          {{ errorMessage }}
          <Button variant="ghost" class="h-auto p-0 ml-1" @click="clearError">✕</Button>
        </div>
        <div v-if="showSuccess" class="text-green-600 ml-2">
          Script saved!
          <Button variant="ghost" class="h-auto p-0 ml-1" @click="clearSuccessMessage">✕</Button>
        </div>
      </div>
      <div class="text-muted-foreground flex items-center gap-2">
        <div>Version: {{ scriptVersion }}</div>
      </div>
    </div>
    <div class="editor-wrapper">
      <div
        ref="editorEl"
        class="monaco-editor-container"
        :style="{ height: editorHeightPx + 'px' }"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch, nextTick } from 'vue'
import { useWallet } from '@/composables/useWallet'
import { useAppColorMode } from '@/composables/useAppColorMode'

import { useAxiosRepo } from '@pinia-orm/axios'
import Script from '../../orm/models/script/Script'
import { useStorage } from '@vueuse/core'
import WalletSelector from '@/components/shared/WalletSelector.vue'
import { Button } from '@/components/ui/button'

const props = defineProps({
  address: { type: String, required: true },
  script: { type: Object, default: null },
})

const emit = defineEmits(['script-updated', 'content-changed'])

const wallet = useWallet()
const { isDark } = useAppColorMode()

const editorEl = ref()

let monaco: any = null
let editor: any = null

async function ensureMonaco() {
  if (!monaco) monaco = await import('monaco-editor/esm/vs/editor/editor.api')
  await import('monaco-editor/esm/vs/basic-languages/python/python.contribution')
  return monaco
}

const currentContent = ref('')
const originalContent = ref('')
const showSuccess = ref(false)
const localError = ref('')
const isSaving = ref(false)
const editorHeightPx = ref(0)
const heightRaf = ref(0)
const selectedEditorExecutor = useStorage(() => `executor:edit:${props.address}`, props.address)

// Authz state
const editorIsAuthz = ref(false)
const editorAuthzNotes = ref('')
const editorSelectedGrant = ref(null)
const editorExecutorAddress = ref('')
const editorGranteeAddress = ref('')

let errorDecorations = null

const defaultCode = `# No script found.`

const canEdit = computed(() => {
  const directOwnerUnlocked = wallet.unlockedWallets.value?.some((w) => w.address === props.address)
  if (directOwnerUnlocked) return true
  if (!editorIsAuthz.value) return false
  if (!editorSelectedGrant.value) return false
  const grantee = editorGranteeAddress.value
  if (!grantee) return false
  const granteeUnlocked = wallet.unlockedWallets.value?.some((w) => w.address === grantee)
  return !!granteeUnlocked
})

const source = computed(() => (props.script ? (props.script.code ?? '') : defaultCode))

const hasChanges = computed(() => canEdit.value && currentContent.value !== originalContent.value)

const readOnly = computed(() => !canEdit.value || isSaving.value)

const editorTheme = computed(() => (isDark.value ? 'vs-dark' : 'vs'))

const errorMessage = computed(() => localError.value)

const scriptVersion = computed(() => {
  const s = props.script
  return s && s.version != null ? String(s.version) : ''
})

async function save() {
  if (!currentContent.value.trim()) {
    localError.value = 'Script cannot be empty'
    return
  }
  clearError()
  clearSuccessMessage()
  const directOwnerUnlocked = wallet.unlockedWallets.value?.some((w) => w.address === props.address)
  let canProceed = !!directOwnerUnlocked
  if (
    !canProceed &&
    editorIsAuthz.value &&
    editorSelectedGrant.value &&
    editorGranteeAddress.value
  ) {
    const granteeUnlocked = wallet.unlockedWallets.value?.some(
      (w) => w.address === editorGranteeAddress.value
    )
    canProceed = !!granteeUnlocked
  }
  if (!canProceed) {
    localError.value = 'Unlock the owner wallet or the selected grantee wallet to save'
    return
  }
  isSaving.value = true
  try {
    await useAxiosRepo(Script)
      .api()
      .updateScript({
        address: props.address,
        code: currentContent.value,
        wallet: {
          sendMsg: (params) =>
            wallet.sendMsg({
              ...params,
              executorAddress: selectedEditorExecutor.value,
              grantee: editorIsAuthz.value ? editorGranteeAddress.value : undefined,
            }),
        },
        gasLimit: 'auto',
      })
    originalContent.value = currentContent.value
    showSuccessMessage()
    emit('script-updated', { address: props.address, code: originalContent.value })
    await useAxiosRepo(Script).api().fetchInfo(props.address)
  } catch (error) {
    console.error('Save failed', error)
    localError.value = `Save failed: ${error?.message || String(error)}`
  } finally {
    isSaving.value = false
  }
}

function clearError() {
  localError.value = ''
  nextTick(() => updateEditorHeight())
}
function showSuccessMessage() {
  showSuccess.value = true
  nextTick(() => updateEditorHeight())
}
function clearSuccessMessage() {
  showSuccess.value = false
  nextTick(() => updateEditorHeight())
}

function editorMsgTypeFilter(grant) {
  const auth = grant?.authorization
  if (!auth?.['@type']) return { valid: false, notes: 'No authorization' }
  if (auth['@type'] === '/cosmos.authz.v1beta1.GenericAuthorization') {
    const ok = auth.msg === '/dysonprotocol.script.v1.MsgUpdateScript'
    return { valid: ok, notes: ok ? 'Generic MsgUpdateScript' : 'Wrong msg type' }
  }
  return { valid: false, notes: 'Unsupported authz type' }
}

function onEditorExecutor(addr) {
  editorExecutorAddress.value = addr || ''
}
function onEditorGrantee(addr) {
  editorGranteeAddress.value = addr || ''
}
function onEditorIsAuthz(v) {
  editorIsAuthz.value = !!v
}
function onEditorAuthzNotes(n) {
  editorAuthzNotes.value = n || ''
}
function onEditorSelectedGrant(g) {
  editorSelectedGrant.value = g || null
}

function dispatchScriptContentChanged() {
  try {
    const content = String(currentContent.value || '')
    const lineCount = content ? content.split('\n').length : 0
    window.dispatchEvent(
      new CustomEvent('dyson:script-content-changed', {
        detail: { address: props.address, lineCount },
      })
    )
  } catch (e) {
    // noop: do not block editor on dispatch errors
  }
}

function restore() {
  const saved = props.script?.code ?? ''
  updateEditorContent(saved)
  originalContent.value = saved
}

async function initEditor() {
  if (!editorEl.value) return
  const m = await ensureMonaco()
  editor = m.editor.create(editorEl.value, {
    value: source.value,
    language: 'python',
    theme: editorTheme.value,
    readOnly: readOnly.value,
    minimap: { enabled: false },
    scrollBeyondLastLine: false,
    automaticLayout: true,
    wordWrap: 'bounded',
    wordWrapColumn: 120,
    wrappingStrategy: 'simple',
    overviewRulerLanes: 0,
    fontSize: 14,
    fontFamily: 'Monaco, Menlo, "Ubuntu Mono", monospace',
  })
  // Auto-fit height to content
  editor.onDidContentSizeChange(() => updateEditorHeight())
  editor.onDidChangeModelContent(() => {
    currentContent.value = editor.getValue()
    clearSuccessMessage()
    emit('content-changed', currentContent.value)
    dispatchScriptContentChanged()
    if (editor.hasTextFocus() && errorDecorations) errorDecorations.set([])
  })
  currentContent.value = editor.getValue()
  dispatchScriptContentChanged()
  updateEditorHeight()
}

function onExceptionEvent(e) {
  if (!editor) return
  const ex = e?.detail
  if (!ex) return
  const line = Number(ex.lineno || 0)
  const startColRaw = Number(ex.col_offset ?? 0)
  const endLine = Number(ex.end_lineno || line)
  const endColRaw = Number(ex.end_col_offset ?? startColRaw + 1)
  highlightRange(line, startColRaw, endLine, endColRaw)
}

onMounted(async () => {
  initEditor()
  if (props.script?.code) originalContent.value = props.script.code
  window.addEventListener('dyson:script-exception', onExceptionEvent)
  window.addEventListener('resize', updateEditorHeight)
})

onUnmounted(() => {
  if (editor) {
    editor.dispose()
    editor = null
  }
  clearSuccessMessage()
  if (heightRaf.value) window.cancelAnimationFrame(heightRaf.value)
  window.removeEventListener('dyson:script-exception', onExceptionEvent)
  window.removeEventListener('resize', updateEditorHeight)
})

function updateEditorContent(newContent) {
  if (editor && editor.getValue() !== newContent) {
    editor.setValue(newContent)
    currentContent.value = newContent
    emit('content-changed', currentContent.value)
  }
}

function updateEditorHeight() {
  if (!editorEl.value) return
  const rect = editorEl.value.getBoundingClientRect()
  const bottomGapPx = 16 // space below editor (padding/margin)
  const desiredHeight = Math.max(200, Math.floor(window.innerHeight - rect.top - bottomGapPx))
  if (Math.abs(desiredHeight - editorHeightPx.value) < 2) return
  if (heightRaf.value) window.cancelAnimationFrame(heightRaf.value)
  heightRaf.value = window.requestAnimationFrame(() => {
    editorHeightPx.value = desiredHeight
    heightRaf.value = 0
  })
}

function highlightRange(line, startColRaw, endLine, endColRaw) {
  if (!editor) return
  const m = monaco
  const col = Math.max(1, Number(startColRaw ?? 0) + 1)
  const endCol = Math.max(1, Number(endColRaw ?? Number(startColRaw ?? 0) + 1) + 1)
  if (!line || line < 1) return
  const model = editor.getModel()
  if (!model) return
  const maxLine = model.getLineCount()
  const safeLine = Math.min(Number(line), maxLine)
  const safeEndLine = Math.min(Number(endLine || line), maxLine)
  const range = new m.Range(safeLine, col, safeEndLine, endCol)
  if (!errorDecorations) errorDecorations = editor.createDecorationsCollection()
  errorDecorations.set([
    { range, options: { inlineClassName: 'monaco-error-inline' } },
    { range, options: { className: 'monaco-error-line', isWholeLine: true } },
  ])
  editor.revealRangeInCenter(range)
  editor.setPosition({ lineNumber: safeLine, column: col })
}

watch(
  () => props.script,
  (script) => {
    if (script?.code !== undefined) {
      originalContent.value = script.code
      updateEditorContent(source.value)
    }
  },
  { immediate: true }
)

watch(source, (newSource) => {
  updateEditorContent(newSource)
})
watch(editorTheme, (theme) => {
  if (editor) monaco.editor.setTheme(theme)
})
watch(readOnly, (isReadOnly) => {
  if (editor) editor.updateOptions({ readOnly: isReadOnly })
})

function clearEditorHighlight() {
  if (errorDecorations) errorDecorations.set([])
}

defineExpose({ restore, clearEditorHighlight })
</script>

<style scoped>
.script-editor {
  width: 100%;
}
.monaco-editor-container {
  width: 100%;
  height: 100%;
  min-height: 0;
}
::deep(.monaco-error-inline) {
  background-color: rgba(244, 63, 94, 0.12);
  outline: 1px solid rgba(244, 63, 94, 0.5);
  cursor: pointer;
}
::deep(.monaco-error-line) {
  background-color: rgba(244, 63, 94, 0.12);
}
::deep(.myLineDecoration) {
  border-left: 3px solid rgba(244, 63, 94, 0.8);
}
</style>
