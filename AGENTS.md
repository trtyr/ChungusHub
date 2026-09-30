# ChungusHub · engram 档案索引

> 本段是 engram 档案的本地指针快照（权威在 engram，勿在此复制文档正文）。pi 启动时从 cwd 加载本文件，任何会话据此一跳直达档案。

## 登记身份

- engram project：`ChungusHub`（id `01a0e895-e1ec-7793-a2f8-f0c261fffc0b`，type=dev）
- codegraph：`ChungusHub`（status=ready · usable，查询前看 freshness；stale 先 sync。索引基线 HEAD `bc9ef16`）
- 文档基线：HEAD `bc9ef16eca0f65242797e454a5bc472c55bf9799`（2026-09-30 update-project 对齐时点；上一基线 `d14f349`，期间并入风险债处置线 W1-W6 与 ST 兼容线）

## 文档清单（15 篇，doc_get 按 id 一跳直达）

| title | category | doc_id |
|---|---|---|
| 项目概览 | 总览 | `01a0e89d-ee13-7601-8043-43d42948213b` |
| 术语表 | 总览 | `01a0e8ad-6e1c-7eb0-b1ae-7036be546c1a` |
| 系统上下文 | 架构与实现 | `01a0e8a6-61a3-7f31-b748-8d0d1d799a77` |
| 模块地图 | 架构与实现 | `01a0e89f-29f0-7692-a181-425e5c855e13` |
| 数据模型 | 架构与实现 | `01a0e89d-2f83-7043-914a-3b116af296f4` |
| API 与接口 | 架构与实现 | `01a0e8a0-2170-7e23-bddb-9c261582dc7d` |
| 运行时视图 | 架构与实现 | `01a0e8a7-253b-7253-ad08-f32dfd8a2618` |
| 部署与运维 | 运维 | `01a0e8ab-0022-7ca2-8295-a22d40837dbe` |
| 测试与门禁 | 运维 | `01a0e8ab-6ac8-7782-91b9-b7ae967d10cf` |
| 技术决策记录 | 决策 | `01a0e8ac-2ec9-7272-9983-837c86245d74` |
| ST 扩展卡兼容层（st-card-compat） | 架构与实现 | `01a0f0ca-34d0-76f1-9130-4348b5765830` |
| 风险与技术债 | 历史 | `01a0e8ac-aeed-7650-8686-af20881f61bf` |
| 风险债处置总账 2026-09-30 | 历史 | `01a0ec41-6d9a-7c52-9263-319151a4e3d0` |
| 开工记录 2026-09-30 | 历史 | `01a0e8b3-b8a8-77c2-b51b-e66577f0f7a2` |
| 更新记录 2026-09-30（当前基线锚点） | 历史 | `01a0f190-4b38-70a3-b2db-50e0a35ec259` |

## 图清单（6 张，projects file_get 按名取；Web 项目页直接渲染）

| 文件 | 内容 |
|---|---|
| `diagram-01-context.html` | C4-L1 系统上下文（本系统 × 用户多设备 / 14 家 LLM 上游 / GitHub / 文件系统 / 部署形态） |
| `diagram-02-modules.html` | 模块依赖图（入口层五门 / handleApi + WS 路由 / 服务层 / 数据层 + shared 契约总线） |
| `diagram-03-er.html` | ER 图（19 表五簇：chat core / library+world / memory / assistant / meta；含 FK 级联与派生设计注记） |
| `diagram-05-seq-llm-stream.html` | 时序：LLM 流式生成主干回合（四道校验→单飞行→流式→commitGeneration→claim 分支） |
| `diagram-06-state.html` | 状态机：LLM 生成生命周期（live→settled→claimed/dropped/aborted，10min claim 窗） |
| `diagram-07-deploy.html` | 部署拓扑（三形态 × 单机单实例 × user-data 单目录 × 北京生产 docker 唯一真身） |

## 检索配方（按意图直达）

- 架构怎么设计 → 模块地图 + diagram-02
- 这个接口是什么 → API 与接口（行号锚点为主啃实读，无已知偏移；仍以源码为准）
- 数据怎么存 → 数据模型 + diagram-03
- 一次生成怎么流 → 运行时视图 + diagram-05-seq-llm-stream + diagram-06-state
- 怎么部署/配置 → 部署与运维 + diagram-07
- ST 美化卡怎么渲染/为什么能跑脚本 → 系统上下文（渲染通道例外）+ API 与接口（render-doc 端点）+ 模块地图 §1.2/§2.3
- 测试怎么跑/门禁 → 测试与门禁
- 为什么这么定 → 技术决策记录（ADR 轻量格式 9 条）
- 有什么坑 → 风险与技术债（16 条全处置，每条带处置结果）+ 风险债处置总账（逐条一行版）
- 术语黑话 → 术语表

## 已知瑕疵与纪律

- 仓库自带 `architecture/`（英文 19 篇）与本档案并存：**engram 为权威**，仓库文档是历史参考；两边冲突以 engram + 源码核对为准
- ~~北京生产实例 pm2 与 docker 双形态并存成因未确认~~ 已收敛（2026-09-30，风险 #10 关闭）：docker `chungushub:local` 唯一真身，pm2 已移除，档案七篇与 diagram-01/07 已同步
- 更新纪律：文档清单变化时同步更新本段（本段是快照，权威在 engram）；后续规划/决策走 plan-tree（`/plan`）
