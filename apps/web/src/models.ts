import { useEffect, useState } from 'react'

export interface ModelOption {
  id: string
  label: string
  note: string
  /** Has been through the golden-question set (docs/spikes/0.3-model.md). */
  evaluated: boolean
}

export interface ModelCatalog {
  default: string
  models: ModelOption[]
}

/** The models the agent offers (GET /models, apps/agent/agent/channels/models.ts). */
export function useModels(): ModelCatalog | null {
  const [catalog, setCatalog] = useState<ModelCatalog | null>(null)
  useEffect(() => {
    let live = true
    fetch('/models')
      .then((r) => (r.ok ? (r.json() as Promise<ModelCatalog>) : null))
      .then((c) => live && setCatalog(c))
      .catch(() => {})
    return () => {
      live = false
    }
  }, [])
  return catalog
}

export function modelLabel(catalog: ModelCatalog | null, id: string | undefined): string | undefined {
  if (!id) return undefined
  return catalog?.models.find((m) => m.id === id)?.label ?? id
}
