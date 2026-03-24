import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  mockGetResidentAchievements,
  mockGetResidentRelationships,
  mockGetResidentMemories,
  mockGetResidentMoodLog,
  mockGetResidentDiary,
  mockGetResidentEducation,
  mockGetResidentJob,
  mockGetResidentPets,
  mockGetResidentSkills,
  mockGenerateMemoir,
  mockInjectResidentMemory,
  mockPatchResidentAttributes,
  mockTradeResidentItem,
  mockGetResidentFamily,
  mockGetResidentFamilyTree,
  mockChatWithResident,
} = vi.hoisted(() => ({
  mockGetResidentAchievements: vi.fn().mockResolvedValue([
    {
      id: 'social_star',
      name: '人气王',
      description: '被 10+ 居民认识',
      icon: '🌟',
      category: 'social',
      unlocked: true,
      unlocked_at_tick: 32,
    },
    {
      id: 'explorer',
      name: '探索者',
      description: '访问过所有区域',
      icon: '🧭',
      category: 'exploration',
      unlocked: false,
      unlocked_at_tick: null,
    },
  ]),
  mockGetResidentRelationships: vi.fn().mockResolvedValue([{ from_id: 'a', to_id: 'b', type: 'friendship', intensity: 0.8, familiarity: 0.5, reason: 'shared tea', since: 'today', counterpart_name: 'Ben', direction: 'outgoing' }]),
  mockGetResidentMemories: vi.fn().mockResolvedValue([]),
  mockGetResidentMoodLog: vi.fn().mockResolvedValue([
    { tick: 8, mood: 'sad', cause: 'weather' },
    { tick: 12, mood: 'calm', cause: 'social' },
  ]),
  mockGetResidentDiary: vi.fn().mockResolvedValue([
    {
      id: 'd1',
      date: 'Day 2',
      day: 2,
      tick: 92,
      content: '**认识了新朋友**，还一起聊了咖啡和天气。',
      tags: ['social', 'weather:sunny', 'highlight'],
      mood_snapshot: 'happy',
      highlight: true,
    },
  ]),
  mockGetResidentEducation: vi.fn().mockResolvedValue({
    resident_id: 'a',
    resident_name: 'Ada',
    education: {
      courses: [{ subject: 'social', name: 'Social Studio', attendance_count: 3 }],
      knowledge_level: { social: 0.76, crafting: 0.42, art: 0.55 },
      course_history: [{ tick: 18, subject: 'social', course_name: 'Social Studio' }],
    },
  }),
  mockGetResidentJob: vi.fn().mockResolvedValue({
    resident_id: 'a',
    resident_name: 'Ada',
    wallet: 240,
    job: { title: 'artist', workplace_id: 'atelier', salary: 18, work_hours: [8, 12, 13, 17], satisfaction: 0.74 },
  }),
  mockGetResidentPets: vi.fn().mockResolvedValue([
    { id: 'pet-1', name: '旺财', species: 'dog', owner_id: 'a', mood: 'happy', hunger: 0.8, location: null, x: 1, y: 1 },
  ]),
  mockGetResidentSkills: vi.fn().mockResolvedValue({
    resident_id: 'a',
    skills: { cooking: 0.82, teaching: 0.45, trading: 0.16 },
  }),
  mockGenerateMemoir: vi.fn(),
  mockInjectResidentMemory: vi.fn(),
  mockPatchResidentAttributes: vi.fn(),
  mockTradeResidentItem: vi.fn().mockResolvedValue({
    seller_resident: { id: 'a', coins: 125, inventory: [] },
    buyer_resident: { id: 'b', coins: 90, inventory: [{ name: 'coffee', quantity: 1, value: 5 }] },
    item_name: 'coffee',
    quantity: 1,
    total_price: 5,
  }),
  mockGetResidentFamily: vi.fn().mockResolvedValue({
    family_name: 'Ada Family',
    resident: { id: 'a', name: 'Ada', age_days: 12, deceased: false, relation: 'self' },
    members: [],
    tree: {
      root: { id: 'a', name: 'Ada', age_days: 12, deceased: false, relation: 'self' },
      parents: [],
      children: [],
      siblings: [],
      spouse: null,
    },
  }),
  mockGetResidentFamilyTree: vi.fn().mockResolvedValue({ self: { id: '', name: '', age_days: 0, deceased: false, relation: 'self' }, parents: [], children: [], siblings: [], partner: null }),
  mockChatWithResident: vi.fn().mockResolvedValue({ reply: 'hello', resident_id: 'r1', resident_name: 'test' }),
}))

vi.mock('../services/api', () => ({
  getResidentAchievements: mockGetResidentAchievements,
  getResidentRelationships: mockGetResidentRelationships,
  getResidentMemories: mockGetResidentMemories,
  getResidentMoodLog: mockGetResidentMoodLog,
  getResidentDiary: mockGetResidentDiary,
  getResidentEducation: mockGetResidentEducation,
  getResidentJob: mockGetResidentJob,
  getResidentPets: mockGetResidentPets,
  getResidentSkills: mockGetResidentSkills,
  generateMemoir: mockGenerateMemoir,
  injectResidentMemory: mockInjectResidentMemory,
  patchResidentAttributes: mockPatchResidentAttributes,
  tradeResidentItem: mockTradeResidentItem,
  getResidentFamily: mockGetResidentFamily,
  getResidentFamilyTree: mockGetResidentFamilyTree,
  chatWithResident: mockChatWithResident,
}))

import { ComparePanel } from '../components/toolbar/ComparePanel'
import { ResidentStoryPanel } from '../components/town/ResidentStoryPanel'
import { useSimulationStore } from '../stores/simulation'

describe('resident avatar placements', () => {
  beforeEach(() => {
    useSimulationStore.setState({
      residents: [
        {
          id: 'a',
          name: 'Ada',
          x: 1,
          y: 1,
          targetX: 1,
          targetY: 1,
          color: 0x38bdf8,
          status: 'idle',
          skinColor: '#d8a27a',
          hairStyle: 'bun',
          hairColor: '#2b1b17',
          outfitColor: '#3b82f6',
          personality: 'calm',
          mood: 'happy',
          goals: [],
          coins: 120,
          occupation: 'artist',
          wallet: 240,
          job: { title: 'artist', workplace_id: 'atelier', salary: 18, work_hours: [8, 12, 13, 17], satisfaction: 0.74 },
          energy: 0.8,
          skills: { cooking: 0.82, teaching: 0.45, trading: 0.16 },
          inventory: [{ name: 'coffee', quantity: 2, value: 5 }, { name: 'book', quantity: 1, value: 7 }],
          pets: [{ id: 'pet-1', name: '旺财', species: 'dog', owner_id: 'a', mood: 'happy', hunger: 0.8, location: null, x: 1, y: 1 }],
        },
        {
          id: 'b',
          name: 'Ben',
          x: 2,
          y: 2,
          targetX: 2,
          targetY: 2,
          color: 0xf59e0b,
          status: 'idle',
          skinColor: '#f0c7a1',
          hairStyle: 'short',
          hairColor: '#2f241c',
          outfitColor: '#10b981',
          personality: 'bold',
          mood: 'neutral',
          goals: [],
          coins: 95,
          occupation: 'chef',
          wallet: 110,
          job: { title: 'chef', workplace_id: 'cafe', salary: 16, work_hours: [8, 12, 13, 17], satisfaction: 0.61 },
          energy: 0.7,
          skills: { cooking: 0.3, teaching: 0.15 },
          inventory: [],
        },
      ],
    })
  })

  it('shows a generated avatar in the resident sidebar header', async () => {
    render(
      <ResidentStoryPanel
        residentId="a"
        residents={useSimulationStore.getState().residents}
        buildings={[]}
        onClose={() => undefined}
      />,
    )

    await waitFor(() => {
      expect(screen.getByRole('img', { name: /ada avatar/i })).toBeInTheDocument()
      expect(screen.getByText(/artist/i)).toBeInTheDocument()
    })
  })

  it('shows generated avatars in compare results', async () => {
    const user = userEvent.setup()

    render(<ComparePanel />)

    const selects = screen.getAllByRole('combobox')
    await user.selectOptions(selects[0], 'a')
    await user.selectOptions(selects[1], 'b')
    await user.click(screen.getByRole('button', { name: /对比|compare/i }))

    await waitFor(() => {
      expect(screen.getByRole('img', { name: /ada avatar/i })).toBeInTheDocument()
      expect(screen.getByRole('img', { name: /ben avatar/i })).toBeInTheDocument()
    })
  })

  it('renders a skills tab with skill levels in the resident sidebar', async () => {
    const user = userEvent.setup()

    render(
      <ResidentStoryPanel
        residentId="a"
        residents={useSimulationStore.getState().residents}
        buildings={[]}
        onClose={() => undefined}
      />,
    )

    await user.click(screen.getByRole('tab', { name: /技能|skills/i }))

    await waitFor(() => {
      expect(screen.getByText(/cooking/i)).toBeInTheDocument()
      expect(screen.getByText(/expert|专家/i)).toBeInTheDocument()
      expect(screen.getByText(/teaching/i)).toBeInTheDocument()
    })
  })

  it('renders a mood log timeline with cause tags in the resident sidebar', async () => {
    const user = userEvent.setup()

    render(
      <ResidentStoryPanel
        residentId="a"
        residents={useSimulationStore.getState().residents}
        buildings={[]}
        onClose={() => undefined}
      />,
    )

    await user.click(screen.getByRole('tab', { name: /情绪日志|mood log/i }))

    await waitFor(() => {
      expect(screen.getByText(/sad/i)).toBeInTheDocument()
      expect(screen.getByText(/^weather$/i)).toBeInTheDocument()
      expect(screen.getAllByText(/^social$/i).length).toBeGreaterThan(0)
    })
  })

  it('renders a memoir tab with resident memory cards', async () => {
    mockGetResidentMemories.mockResolvedValueOnce([
      {
        id: 'memory-1',
        content: '第一次在广场遇见了 Ben，还一起聊了天气。',
        timestamp: 'Day 1, 08:00',
        importance: 0.9,
        emotion: 'happy',
        tick: 4,
        type: 'first_meeting',
        emotional_weight: 0.8,
        related_resident_ids: ['b'],
      },
    ])

    const user = userEvent.setup()

    render(
      <ResidentStoryPanel
        residentId="a"
        residents={useSimulationStore.getState().residents}
        buildings={[]}
        onClose={() => undefined}
      />,
    )

    await user.click(screen.getByRole('tab', { name: /回忆录|memoir/i }))

    await waitFor(() => {
      expect(screen.getByText(/第一次在广场遇见了 ben/i)).toBeInTheDocument()
      expect(screen.getByText(/first_meeting/i)).toBeInTheDocument()
    })
  })

  it('renders a backpack tab with items and trade action', async () => {
    const user = userEvent.setup()

    render(
      <ResidentStoryPanel
        residentId="a"
        residents={useSimulationStore.getState().residents}
        buildings={[]}
        onClose={() => undefined}
      />,
    )

    await user.click(screen.getByRole('tab', { name: /背包|backpack/i }))

    await waitFor(() => {
      expect(screen.getByText(/coffee/i)).toBeInTheDocument()
      expect(screen.getByText(/book/i)).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /交易|trade/i })).toBeInTheDocument()
    })
  })

  it('renders a diary timeline with mood icon and tags', async () => {
    const user = userEvent.setup()

    render(
      <ResidentStoryPanel
        residentId="a"
        residents={useSimulationStore.getState().residents}
        buildings={[]}
        onClose={() => undefined}
      />,
    )

    await user.click(screen.getByRole('tab', { name: /日记|diary/i }))

    await waitFor(() => {
      expect(screen.getByText(/认识了新朋友/i)).toBeInTheDocument()
      expect(screen.getAllByText(/^social$/i).length).toBeGreaterThan(0)
      expect(screen.getByText(/^weather:sunny$/i)).toBeInTheDocument()
      expect(screen.getAllByText(/^happy$/i).length).toBeGreaterThan(0)
    })
  })

  it('renders achievements tab with unlocked and locked badges', async () => {
    const user = userEvent.setup()

    render(
      <ResidentStoryPanel
        residentId="a"
        residents={useSimulationStore.getState().residents}
        buildings={[]}
        onClose={() => undefined}
      />,
    )

    await user.click(screen.getByRole('tab', { name: /成就|achievements/i }))

    await waitFor(() => {
      expect(screen.getByText(/探索者/i)).toBeInTheDocument()
      expect(screen.getByText(/人气王/i)).toBeInTheDocument()
      expect(screen.getByText(/#32/i)).toBeInTheDocument()
    })
  })

  it('renders an education tab with radar data and course history', async () => {
    const user = userEvent.setup()

    render(
      <ResidentStoryPanel
        residentId="a"
        residents={useSimulationStore.getState().residents}
        buildings={[]}
        onClose={() => undefined}
      />,
    )

    await user.click(screen.getByRole('tab', { name: /学业|studies/i }))

    await waitFor(() => {
      expect(screen.getAllByText(/social studio/i).length).toBeGreaterThan(0)
      expect(screen.getByText(/crafting/i)).toBeInTheDocument()
      expect(screen.getByLabelText(/education-radar/i)).toBeInTheDocument()
    })
  })

  it('renders a pets tab with pet status in the resident sidebar', async () => {
    const user = userEvent.setup()

    render(
      <ResidentStoryPanel
        residentId="a"
        residents={useSimulationStore.getState().residents}
        buildings={[]}
        onClose={() => undefined}
      />,
    )

    await user.click(screen.getByRole('tab', { name: /宠物|pets/i }))

    await waitFor(() => {
      expect(screen.getAllByText(/旺财/i).length).toBeGreaterThan(0)
      expect(screen.getAllByText(/dog/i).length).toBeGreaterThan(0)
      expect(screen.getAllByText(/80%/i).length).toBeGreaterThan(0)
    })
  })
})
