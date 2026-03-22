import type { ScenarioData } from '../../services/api'

export interface SceneCardDefinition {
  id: string
  i18nKey: string
  residents: number
  buildings: number
  color: string
  border: string
  accent: string
  recommended: boolean
  preview: Array<{ emoji: string; x: number; y: number }>
}

export interface CustomSceneRecord {
  id: string
  name: string
  basedOn: string
  scenario: ScenarioData
  createdAt: string
}

export const CUSTOM_SCENES_STORAGE_KEY = 'populace:custom-scenes'

export const PRESET_SCENES: SceneCardDefinition[] = [
  {
    id: 'modern_community',
    i18nKey: 'modern_community',
    residents: 10,
    buildings: 8,
    color: 'from-cyan-500/20 to-violet-500/10',
    border: 'border-cyan-400/30',
    accent: 'text-cyan-300',
    recommended: true,
    preview: [
      { emoji: '\uD83C\uDFE2', x: 8, y: 12 },
      { emoji: '\u2615', x: 55, y: 8 },
      { emoji: '\uD83C\uDF33', x: 80, y: 30 },
      { emoji: '\uD83C\uDFEA', x: 30, y: 50 },
      { emoji: '\uD83D\uDC69', x: 20, y: 70 },
      { emoji: '\uD83D\uDC68', x: 65, y: 65 },
      { emoji: '\uD83D\uDCAC', x: 42, y: 38 },
    ],
  },
  {
    id: 'seaside_village',
    i18nKey: 'seaside_village',
    residents: 6,
    buildings: 6,
    color: 'from-blue-500/20 to-teal-500/10',
    border: 'border-blue-400/30',
    accent: 'text-blue-300',
    recommended: false,
    preview: [
      { emoji: '\u26F5', x: 55, y: 10 },
      { emoji: '\uD83C\uDF0A', x: 20, y: 68 },
      { emoji: '\uD83C\uDFE0', x: 8, y: 30 },
      { emoji: '\uD83D\uDC1F', x: 75, y: 55 },
      { emoji: '\uD83C\uDFEE', x: 45, y: 42 },
      { emoji: '\uD83D\uDC74', x: 30, y: 72 },
    ],
  },
  {
    id: 'mountain_village',
    i18nKey: 'mountain_village',
    residents: 8,
    buildings: 6,
    color: 'from-amber-500/20 to-emerald-500/10',
    border: 'border-amber-400/30',
    accent: 'text-amber-200',
    recommended: false,
    preview: [
      { emoji: '\u26F0\uFE0F', x: 15, y: 12 },
      { emoji: '\uD83C\uDF32', x: 74, y: 18 },
      { emoji: '\uD83C\uDFD8\uFE0F', x: 24, y: 58 },
      { emoji: '\u26E9\uFE0F', x: 58, y: 33 },
      { emoji: '\uD83D\uDCA7', x: 42, y: 69 },
      { emoji: '\uD83D\uDD28', x: 67, y: 55 },
    ],
  },
]

export const SCENE_TEMPLATES: Record<string, ScenarioData> = {
  modern_community: {
    name: '现代小区',
    description: '一个充满故事的现代都市小区，街坊邻里各有各的悲欢离合。',
    map: {
      width: 40,
      height: 30,
      roads: [
        { x: 0, y: 14, width: 40, height: 2 },
        { x: 19, y: 0, width: 2, height: 30 },
      ],
      water: [{ x: 0, y: 0, width: 6, height: 6 }],
    },
    buildings: [
      { id: 'home_a', type: 'home', name: '阳光公寓A栋', capacity: 4, position: [3, 8] },
      { id: 'home_b', type: 'home', name: '阳光公寓B栋', capacity: 4, position: [10, 8] },
      { id: 'home_c', type: 'home', name: '河畔公寓', capacity: 4, position: [24, 4] },
      { id: 'home_d', type: 'home', name: '悦庭公寓', capacity: 4, position: [33, 4] },
      { id: 'cafe_1', type: 'cafe', name: '晨曦咖啡馆', capacity: 4, position: [13, 5] },
      { id: 'park_1', type: 'park', name: '社区公园', capacity: 20, position: [10, 20] },
      { id: 'shop_1', type: 'shop', name: '便利小屋', capacity: 3, position: [28, 10] },
      { id: 'school_1', type: 'school', name: '社区学堂', capacity: 8, position: [32, 22] },
    ],
    residents: [
      { id: 'r_xiaoming', name: '小明', personality: '外向、乐观开朗、喜欢交朋友，有时有点冒失', home_id: 'home_a', x: 4, y: 9 },
      { id: 'r_xiaohong', name: '小红', personality: '内向、温柔善良、观察力强，慢热但忠诚', home_id: 'home_a', x: 5, y: 10 },
      { id: 'r_daqiang', name: '大强', personality: '外向、竞争心强、直来直去，讲义气', home_id: 'home_b', x: 11, y: 9 },
      { id: 'r_lili', name: '丽丽', personality: '外向、爱八卦、热情活泼、消息灵通', home_id: 'home_b', x: 12, y: 10 },
      { id: 'r_awei', name: '阿伟', personality: '内向、博学多才、话不多但句句有料，有些宅', home_id: 'home_c', x: 25, y: 5 },
      { id: 'r_xiuxiu', name: '秀秀', personality: '外向、热情似火、爱帮忙、偶尔话太多', home_id: 'home_c', x: 26, y: 6 },
      { id: 'r_laowang', name: '老王', personality: '内向、沉稳老练、阅历丰富，不轻易表态', home_id: 'home_d', x: 34, y: 5 },
      { id: 'r_xiaohua', name: '小花', personality: '外向、浪漫多情、富有艺术感，容易陷入感情', home_id: 'home_d', x: 35, y: 6 },
      { id: 'r_jianguo', name: '建国', personality: '内向、勤劳踏实、责任心强，不善于表达感情', home_id: 'home_a', x: 4, y: 11 },
      { id: 'r_xiaotong', name: '晓彤', personality: '外向、活力四射、爱运动、对任何事都充满好奇', home_id: 'home_b', x: 11, y: 11 },
    ],
  },
  seaside_village: {
    name: '海边渔村',
    description: '宁静的海边小渔村，渔夫与商人在海风中演绎各自的故事。',
    map: {
      width: 40,
      height: 30,
      roads: [
        { x: 0, y: 16, width: 40, height: 2 },
        { x: 18, y: 0, width: 2, height: 16 },
      ],
      water: [{ x: 0, y: 0, width: 40, height: 8 }],
    },
    buildings: [
      { id: 'harbor', type: 'shop', name: '渔港码头', capacity: 6, position: [5, 9] },
      { id: 'fish_market', type: 'shop', name: '鱼市', capacity: 5, position: [14, 9] },
      { id: 'lighthouse', type: 'school', name: '灯塔', capacity: 2, position: [30, 12] },
      { id: 'cottage_a', type: 'home', name: '海边小屋A', capacity: 3, position: [5, 21] },
      { id: 'cottage_b', type: 'home', name: '海边小屋B', capacity: 3, position: [15, 21] },
      { id: 'tavern', type: 'cafe', name: '渔人酒馆', capacity: 4, position: [25, 21] },
    ],
    residents: [
      { id: 'r_laohai', name: '老海', personality: '内向、沉默寡言、海上经验丰富、为人忠厚', home_id: 'cottage_a', x: 6, y: 22 },
      { id: 'r_xiaolan', name: '小岚', personality: '外向、活泼好动、对未知充满好奇、爱跟渔船出海', home_id: 'cottage_a', x: 7, y: 23 },
      { id: 'r_shang_ren', name: '胡掌柜', personality: '外向、精明能干、爱砍价、心里藏着一本账', home_id: 'cottage_b', x: 16, y: 22 },
      { id: 'r_yuer', name: '鱼儿', personality: '内向、温柔、擅长腌鱼、爱在灯塔附近发呆', home_id: 'cottage_b', x: 17, y: 23 },
      { id: 'r_deng_shou', name: '灯守', personality: '内向、博学、独居灯塔、观察海面为乐', home_id: 'cottage_b', x: 31, y: 13 },
      { id: 'r_ah_gui', name: '阿贵', personality: '外向、嗜酒、爱讲故事、对每个人都热情', home_id: 'cottage_a', x: 26, y: 22 },
    ],
  },
  mountain_village: {
    name: '云岚山村',
    description: '藏在群山与溪流间的古朴山村，猎人、草药师与守庙人围绕四季山林过着紧密相连的生活。',
    map: {
      width: 40,
      height: 30,
      roads: [
        { x: 6, y: 18, width: 26, height: 2 },
        { x: 14, y: 9, width: 2, height: 11 },
        { x: 22, y: 6, width: 2, height: 14 },
        { x: 28, y: 11, width: 2, height: 9 },
      ],
      water: [
        { x: 0, y: 6, width: 12, height: 2 },
        { x: 10, y: 7, width: 2, height: 9 },
        { x: 11, y: 14, width: 11, height: 2 },
      ],
    },
    buildings: [
      { id: 'hunter_lodge', type: 'home', name: '猎人小屋', capacity: 2, position: [9, 18] },
      { id: 'herb_shop', type: 'shop', name: '草药铺', capacity: 3, position: [15, 12] },
      { id: 'mountain_shrine', type: 'school', name: '山神庙', capacity: 4, position: [23, 8] },
      { id: 'blacksmith', type: 'shop', name: '铁匠铺', capacity: 3, position: [29, 13] },
      { id: 'chief_house', type: 'home', name: '村长家', capacity: 3, position: [20, 18] },
      { id: 'hot_spring', type: 'park', name: '温泉', capacity: 8, position: [30, 20] },
    ],
    residents: [
      { id: 'r_shanmu', name: '山木', personality: '寡言沉着的老猎人，熟悉山路与兽迹，习惯先观察再行动。', home_id: 'hunter_lodge', x: 10, y: 19 },
      { id: 'r_yelan', name: '叶岚', personality: '机敏大胆的年轻猎人，争强好胜，渴望证明自己比前辈更出色。', home_id: 'hunter_lodge', x: 11, y: 20 },
      { id: 'r_qingzhi', name: '青枝', personality: '温柔细致的草药师，记忆力极好，对每种药草的气味都异常敏感。', home_id: 'herb_shop', x: 16, y: 13 },
      { id: 'r_muyao', name: '木遥', personality: '神神叨叨却心地善良的草药采集人，喜欢在林间自言自语。', home_id: 'herb_shop', x: 17, y: 14 },
      { id: 'r_shenpo', name: '神婆', personality: '敬畏山神、言语含蓄的守庙人，擅长安抚人心，也藏着不少旧秘密。', home_id: 'mountain_shrine', x: 24, y: 9 },
      { id: 'r_tiechuan', name: '铁川', personality: '脾气火爆但重情重义的铁匠，做事干脆，说话像锤子一样直。', home_id: 'blacksmith', x: 30, y: 14 },
      { id: 'r_xunfeng', name: '寻枫', personality: '谨慎持重的年轻村长，凡事讲规矩，总想在传统和变化之间找平衡。', home_id: 'chief_house', x: 21, y: 19 },
      { id: 'r_wenxi', name: '温溪', personality: '爱笑健谈的温泉看守，最擅长撮合大家和解，也最爱听八卦。', home_id: 'chief_house', x: 31, y: 21 },
    ],
  },
}

export function cloneScenarioTemplate(sceneId: string): ScenarioData {
  const template = SCENE_TEMPLATES[sceneId]
  return JSON.parse(JSON.stringify(template)) as ScenarioData
}

export function loadCustomScenes(): CustomSceneRecord[] {
  try {
    const raw = window.localStorage.getItem(CUSTOM_SCENES_STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as CustomSceneRecord[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function saveCustomScenes(scenes: CustomSceneRecord[]): void {
  window.localStorage.setItem(CUSTOM_SCENES_STORAGE_KEY, JSON.stringify(scenes))
}
