/**
 * 数据结构权威定义（文档 5.1 节）。
 * 拆解顺序 = layers 数组顺序（自上而下），与 image_0 的垂直爆炸叙事一致。
 */

/** 相机位姿（美术在场景内摆好后导出，不写死在代码里） */
export interface CameraPose {
  position: [number, number, number]
  target: [number, number, number]
  fov?: number
}

/** 爆炸图中的一个层 */
export interface LayerDef {
  id: string // 'switches'
  index: number // 展示编号 1-based → 渲染为 02 样式
  name: string // 层名「轴体」
  category: string // 编号后的层别词「轴体层」「主板」「底壳」
  description: string // 左侧栏人格化长描述（铁律 L4 的精确文案）
  materialChip: string // 右侧栏短词卡「Poron」「6063 铝」
  icon: string // 图标路径
  colorEmphasis?: 'red' | 'mint' // 霓虹强调色（轴体=red，对应 image_0）
  nodeNames: string[] // 模型内归属该层的 mesh 名前缀（拾取与归组依据）
  anchor: 'left' | 'right' // 连线引出方向
  nested?: DeviceDef // 可进一步拆解的子设备（F5）
}

/** 单个可拆解设备的完整定义 */
export interface DeviceDef {
  id: string
  name: string // 展示名，如「PBT 二色机械键盘」
  modelUrl: string // GLB 路径（资产就位后启用；当前走程序化工厂回退）
  explodeGap: number // 爆炸层间距（该设备归一化单位）
  focusCamera: CameraPose // 聚焦位姿（设备局部坐标系）
  layers: LayerDef[] // 拆解顺序 = 数组顺序（自上而下）
  /** 嵌套子设备专用：挂到宿主层爆炸位时的朝向（弧度）。缺省 π/2（散热器风扇脸朝玻璃） */
  mountRotationY?: number
}

/** 顶层清单（devices.json） */
export interface DeviceCatalog {
  computerId: string
  scene: { desktopModel: string }
  devices: Record<string, DeviceDef>
}
