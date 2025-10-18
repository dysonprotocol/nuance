export type ParsedParameter = {
  name: string
  required: boolean
  default?: unknown
  annotation?: string
}

export type ParsedFunction = {
  function_name: string
  docstring: string
  parameters: ParsedParameter[]
  kwargs: Record<string, unknown> | null
  start_line: number
  end_line: number
}

export declare function parseScriptFunctions(source: string | undefined | null): ParsedFunction[]
export declare function extractDocstring(source: string | undefined | null): string
export declare function buildKwargSkeleton(
  parameters: ParsedParameter[] | undefined | null
): Record<string, unknown> | null
export declare function buildFormDefaults(
  parameters: ParsedParameter[] | undefined | null
): Record<string, unknown> | null
