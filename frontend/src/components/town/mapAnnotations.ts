const STORAGE_KEY = 'populace:map-annotations'

export interface MapAnnotation {
  id: string
  tileX: number
  tileY: number
  label: string
  icon: string
}

export function loadAnnotations(): MapAnnotation[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function saveAnnotations(annotations: MapAnnotation[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(annotations))
}

export function addAnnotation(tileX: number, tileY: number, label: string, icon = '📌'): MapAnnotation {
  const annotations = loadAnnotations()
  const annotation: MapAnnotation = {
    id: `ann_${Date.now()}`,
    tileX,
    tileY,
    label,
    icon,
  }
  annotations.push(annotation)
  saveAnnotations(annotations)
  return annotation
}

export function removeAnnotation(id: string): void {
  const annotations = loadAnnotations().filter((a) => a.id !== id)
  saveAnnotations(annotations)
}

export function updateAnnotation(id: string, updates: Partial<Pick<MapAnnotation, 'label' | 'icon'>>): void {
  const annotations = loadAnnotations().map((a) =>
    a.id === id ? { ...a, ...updates } : a,
  )
  saveAnnotations(annotations)
}
