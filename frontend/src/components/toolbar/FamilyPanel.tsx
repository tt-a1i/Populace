import { Suspense, lazy } from 'react'
import { useTranslation } from 'react-i18next'

import { useSimulationStore } from '../../stores/simulation'
import { PanelShell } from '../ui/PanelShell'
import { PanelEmptyState, PanelSpinner } from '../ui/PanelStates'

const FamilyTreePanel = lazy(() =>
  import('../town/FamilyTreePanel').then((module) => ({ default: module.FamilyTreePanel })),
)

export function FamilyPanel() {
  const { t } = useTranslation()
  const selectedResidentId = useSimulationStore((state) => state.selectedResidentId)

  return (
    <PanelShell
      icon="🌳"
      title={t('toolbar.family', { defaultValue: '家族谱系' })}
      badge={t('family.badge', { defaultValue: 'Family Tree' })}
    >
      <div data-testid="family-panel">
      {selectedResidentId ? (
        <Suspense
          fallback={
            <PanelSpinner
              title={t('toolbar.family', { defaultValue: '家族谱系' })}
              message={t('family.loading', { defaultValue: '正在载入家族关系…' })}
            />
          }
        >
          <FamilyTreePanel residentId={selectedResidentId} />
        </Suspense>
      ) : (
        <PanelEmptyState
          title={t('family.select_resident_title', { defaultValue: '还没有选中居民' })}
          message={t('family.select_resident', { defaultValue: '先在地图或居民面板中选择一位居民。' })}
        />
      )}
      </div>
    </PanelShell>
  )
}
