import { useTranslation } from 'react-i18next'

import { useSimulationStore } from '../../stores/simulation'
import { FamilyTreePanel } from '../town/FamilyTreePanel'
import { PanelShell } from '../ui/PanelShell'

export function FamilyPanel() {
  const { t } = useTranslation()
  const selectedResidentId = useSimulationStore((state) => state.selectedResidentId)

  return (
    <PanelShell
      icon="🌳"
      title={t('toolbar.family', { defaultValue: '家族谱系' })}
      badge={t('family.badge', { defaultValue: 'Family Tree' })}
    >
      {selectedResidentId ? (
        <FamilyTreePanel residentId={selectedResidentId} />
      ) : (
        <p className="py-6 text-sm text-slate-400">
          {t('family.select_resident', { defaultValue: '先在地图或居民面板中选择一位居民。' })}
        </p>
      )}
    </PanelShell>
  )
}
