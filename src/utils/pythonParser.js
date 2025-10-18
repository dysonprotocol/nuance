/**
 * Python script parsing utilities
 */

import { parse as parsePyAst, NodeVisitor as PyAstNodeVisitor } from 'py-ast'

export class ScriptParseError extends Error {
  constructor(message, line = null) {
    super(message)
    this.name = 'ScriptParseError'
    this.line = line
  }
}

export function parseScriptFunctions(source) {
  if (!source?.trim()) return []

  const lines = source.split('\n')

  const visitorResults = []

  class FuncVisitor extends PyAstNodeVisitor {
    visitFunctionDef(node) {
      const fn = buildFunctionRecord(node, source, lines)
      if (fn) visitorResults.push(fn)
      this.genericVisit(node)
    }

    visitAsyncFunctionDef(node) {
      return this.visitFunctionDef(node)
    }
  }

  const ast = parsePyAst(source)
  const visitor = new FuncVisitor()
  visitor.visit(ast)

  // Filter out private helpers
  return visitorResults.filter(
    (f) => f.function_name && !f.function_name.startsWith('_') && f.function_name !== 'wsgi'
  )
}

function buildFunctionRecord(node, source, lines) {
  const name = node?.name
  if (!name) return null

  const startLine = node.lineno ?? 1
  const endLine = node.end_lineno ?? findFunctionEnd(lines, startLine - 1)

  const parameters = extractParametersFromAst(node, source)
  const signature = `${name}(${parameters
    .map((p) => (p.required ? p.name : `${p.name}=${formatDefaultForSignature(p.default)}`))
    .join(', ')})`

  const docstring = getDocstringFromAst(node)

  const hasVariadicKwargs = Boolean(node?.args?.kwarg)
  const kwargsSkeleton = hasVariadicKwargs ? {} : buildKwargSkeleton(parameters)

  return {
    function_name: name,
    docstring,
    parameters,
    kwargs: kwargsSkeleton,
    signature,
    start_line: startLine,
    end_line: endLine,
  }
}

function getDocstringFromAst(node) {
  if (!node?.body?.length) return ''
  const first = node.body[0]
  // Expr(Constant(str)) or legacy Str
  if (first.nodeType === 'Expr') {
    const val = first.value
    if (!val) return ''
    if (val.nodeType === 'Constant' && typeof val.value === 'string')
      return normalizeDocstring(val.value)
    if (val.nodeType === 'Str' && typeof val.s === 'string') return normalizeDocstring(val.s)
  }
  return ''
}

function extractParametersFromAst(node, source) {
  const args = node.args || {}
  const posonly = args.posonlyargs || []
  const posOrKw = args.args || []
  const kwonly = args.kwonlyargs || []
  const posDefaults = args.defaults || []
  const kwDefaults = args.kw_defaults || []

  const params = []

  const positional = [...posonly, ...posOrKw]
  const numPos = positional.length
  const numPosDefaults = posDefaults.length

  for (let i = 0; i < numPos; i++) {
    const argNode = positional[i]
    const hasDefault = i >= numPos - numPosDefaults
    const defaultIndex = i - (numPos - numPosDefaults)
    const defaultNode = hasDefault ? posDefaults[defaultIndex] : undefined
    const param = buildParamFromAstArg(argNode, hasDefault, defaultNode, source)
    params.push(param)
  }

  for (let i = 0; i < kwonly.length; i++) {
    const argNode = kwonly[i]
    const defaultNode = kwDefaults[i]
    const hasDefault = defaultNode != null
    const param = buildParamFromAstArg(argNode, hasDefault, defaultNode, source)
    params.push(param)
  }

  // Skip *args (args.vararg) and **kwargs (args.kwarg)
  return params
}

function buildParamFromAstArg(argNode, hasDefault, defaultNode, source) {
  const name = argNode.arg
  const annotation = astAnnotationToString(argNode.annotation)

  let defaultValue
  if (hasDefault) {
    const jsVal = astValueToJs(defaultNode)
    if (jsVal !== undefined) defaultValue = jsVal
    else defaultValue = extractSourceForNode(defaultNode, source) ?? null
  }

  const param = {
    name,
    required: !hasDefault,
  }

  if (hasDefault) param.default = defaultValue
  if (annotation) param.annotation = annotation

  return param
}

function astAnnotationToString(node) {
  if (!node) return ''
  switch (node.nodeType) {
    case 'Name':
      return node.id || ''
    case 'Attribute': {
      const value = astAnnotationToString(node.value)
      const attr = node.attr || ''
      return value ? `${value}.${attr}` : attr
    }
    case 'Subscript': {
      const value = astAnnotationToString(node.value)
      const slice = astAnnotationToString(node.slice)
      return slice ? `${value}[${slice}]` : value
    }
    case 'Tuple':
      return (node.elts || []).map(astAnnotationToString).join(', ')
    case 'Constant':
      return String(node.value)
    case 'Str':
      return String(node.s)
    default:
      return ''
  }
}

function astValueToJs(node) {
  if (!node) return undefined
  switch (node.nodeType) {
    case 'Constant':
      return node.value
    case 'Num':
      return Number(node.n)
    case 'Str':
      return String(node.s)
    case 'NameConstant':
      return node.value
    case 'List':
    case 'Tuple':
      return (node.elts || []).map(astValueToJs)
    case 'Dict': {
      const keys = node.keys || []
      const values = node.values || []
      const out = {}
      for (let i = 0; i < keys.length; i++) {
        out[String(astValueToJs(keys[i]))] = astValueToJs(values[i])
      }
      return out
    }
    default:
      return undefined
  }
}

function extractSourceForNode(node, source) {
  if (!node || node.lineno == null || node.end_lineno == null) return null
  const lines = source.split('\n')
  const startLineIdx = Math.max(0, node.lineno - 1)
  const endLineIdx = Math.max(0, node.end_lineno - 1)
  const slice = lines.slice(startLineIdx, endLineIdx + 1)
  if (!slice.length) return null
  const first = slice[0]
  const last = slice[slice.length - 1]
  const startCol = node.col_offset ?? 0
  const endCol = node.end_col_offset ?? last.length
  if (slice.length === 1) return first.slice(startCol, endCol)
  slice[0] = first.slice(startCol)
  slice[slice.length - 1] = last.slice(0, endCol)
  return slice.join('\n')
}

function formatDefaultForSignature(val) {
  if (val === undefined) return '...'
  if (typeof val === 'string') return `'${val}'`
  if (val && typeof val === 'object') return JSON.stringify(val)
  return String(val)
}

export function extractDocstring(source) {
  if (!source) return ''
  const match = source.match(/^\s*(?:[rRuUbBfF]{0,2})?("""|''')([\s\S]*?)\1/s)
  return match?.[2] ? normalizeDocstring(match[2]) : ''
}

function findFunctionEnd(lines, startIndex) {
  const baseLine = lines[startIndex]
  if (!baseLine) return startIndex + 1

  const baseIndent = baseLine.match(/^(\s*)/)[1].length

  for (let i = startIndex + 1; i < lines.length; i++) {
    const line = lines[i]
    const trimmed = line.trim()

    // Skip empty lines and comments
    if (!trimmed || trimmed.startsWith('#')) continue

    const indent = line.match(/^(\s*)/)[1].length

    // Function ends when we find a line at same or lower indentation
    // that starts a new definition or statement
    if (
      indent <= baseIndent &&
      (trimmed.startsWith('def ') ||
        trimmed.startsWith('class ') ||
        trimmed.startsWith('@') ||
        (!trimmed.startsWith('"""') && !trimmed.startsWith("'''")))
    ) {
      return i
    }
  }

  return lines.length
}

function normalizeDocstring(text) {
  if (!text) return ''
  const unix = String(text).replace(/\r\n?/g, '\n')
  let lines = unix.split('\n')

  // Trim leading/trailing empty lines
  while (lines.length && lines[0].trim() === '') lines.shift()
  while (lines.length && lines[lines.length - 1].trim() === '') lines.pop()
  if (lines.length === 0) return ''

  if (lines.length === 1) return lines[0].trim()

  // Compute minimum indent from all non-empty lines except the first
  let minIndent = Infinity
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i]
    if (!line.trim()) continue
    const indent = line.match(/^(\s*)/)[1].length
    if (indent < minIndent) minIndent = indent
  }
  if (!Number.isFinite(minIndent)) minIndent = 0

  const first = lines[0].trim()
  const rest = lines.slice(1).map((line) => {
    if (!minIndent) return line
    const currentIndent = line.match(/^(\s*)/)[1].length
    const remove = Math.min(currentIndent, minIndent)
    return line.slice(remove)
  })
  return [first, ...rest].join('\n')
}

export function buildKwargSkeleton(parameters) {
  if (!parameters || parameters.length === 0) {
    return null // no parameters
  }

  const required = parameters.filter((p) => p.required)
  if (required.length === 0) {
    return {} // all parameters are optional
  }

  return Object.fromEntries(required.map((p) => [p.name, null]))
}

export function buildFormDefaults(parameters) {
  if (!parameters || parameters.length === 0) {
    return null // no parameters
  }

  const formData = {}
  for (const param of parameters) {
    if (param.required) {
      formData[param.name] = null
    } else {
      formData[param.name] = param.default
    }
  }

  return formData
}

// removed legacy regex-based parameter parsing in favor of AST-based parsing
