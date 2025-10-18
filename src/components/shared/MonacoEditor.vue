<template>
  <div ref="container" class="w-full h-full"></div>
</template>

<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted } from 'vue'
import type * as Monaco from 'monaco-editor/esm/vs/editor/editor.api'

const props = defineProps<{
  modelValue: string
  language?: string
  theme?: string
  lineNumberOffset?: number
  options?: Record<string, unknown>
}>()

const emit = defineEmits<{ 'update:modelValue': [value: string] }>()

const container = ref<any>(null)
let monaco: typeof Monaco | null = null
let editor: Monaco.editor.IStandaloneCodeEditor | null = null
let decorations: Monaco.editor.IEditorDecorationsCollection | null = null

async function ensureMonaco(language?: string) {
  if (!monaco) {
    monaco = (await import('monaco-editor/esm/vs/editor/editor.api')) as typeof Monaco
  }
  if (language === 'python') {
    await import('monaco-editor/esm/vs/basic-languages/python/python.contribution')
  }
  return monaco
}

async function createEditor() {
  if (!container.value) return
  const m = await ensureMonaco(props.language)
  const initial: Monaco.editor.IStandaloneEditorConstructionOptions = {
    value: props.modelValue ?? '',
    language: props.language || 'plaintext',
    theme: props.theme || 'vs',
    minimap: { enabled: false },
    scrollBeyondLastLine: false,
    automaticLayout: true,
    wordWrap: 'on',
    fontSize: 12,
    fontFamily: 'Monaco, Menlo, "Ubuntu Mono", monospace',
    lineNumbers: (n) => String(n + Number(props.lineNumberOffset || 0)),
    ...(props.options || {}),
  }
  editor = m.editor.create(container.value, initial)
  decorations = editor.createDecorationsCollection()
  editor.onDidChangeModelContent(() => {
    const v = editor!.getValue()
    if (v !== props.modelValue) emit('update:modelValue', v)
  })
}

function disposeEditor() {
  if (editor) {
    editor.dispose()
    editor = null
  }
  decorations = null
}

onMounted(() => {
  createEditor()
})

onUnmounted(() => {
  disposeEditor()
})

watch(
  () => props.modelValue,
  (v) => {
    if (!editor) return
    const cur = editor.getValue()
    if (v !== cur) editor.setValue(v || '')
  }
)

watch(
  () => props.theme,
  (t) => {
    if (!t) return
    if (!monaco) return
    monaco.editor.setTheme(t)
  }
)

watch(
  () => props.language,
  (lang) => {
    if (!editor || !lang) return
    if (!monaco) return
    const model = editor.getModel()
    if (model) monaco.editor.setModelLanguage(model, lang)
  }
)

watch(
  () => props.lineNumberOffset,
  () => {
    if (!editor) return
    const off = Number(props.lineNumberOffset || 0)
    editor.updateOptions({ lineNumbers: (n) => String(n + off) })
  }
)

function layout() {
  editor?.layout()
}

function highlightRange(startLine: number, startCol: number, endLine: number, endCol: number) {
  if (!editor || !monaco) return
  const sLine = Math.max(1, Number(startLine || 1))
  const eLine = Math.max(sLine, Number(endLine || startLine || 1))
  const sCol = Math.max(1, Number(startCol || 1))
  const eCol = Math.max(1, Number(endCol || sCol + 1))
  const range = new monaco.Range(sLine, sCol, eLine, eCol)
  if (!decorations) decorations = editor.createDecorationsCollection()
  decorations.set([
    { range, options: { inlineClassName: 'monaco-error-inline' } },
    { range, options: { className: 'monaco-error-line', isWholeLine: true } },
  ])
  editor.revealRangeInCenter(range)
  editor.setPosition({ lineNumber: sLine, column: sCol })
}

function clearDecorations() {
  decorations?.set([])
}

defineExpose({ layout, highlightRange, clearDecorations })
</script>

<style scoped>
.w-full {
  width: 100%;
}
.h-full {
  height: 100%;
}
</style>
