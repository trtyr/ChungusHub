# ChungusHub · engram 档案索引

> 本段是 engram 档案的本地指针快照（权威在 engram，勿在此复制文档正文）。pi 启动时从 cwd 加载本文件，任何会话据此一跳直达档案。

## 登记身份

- engram project：`ChungusHub`（id `01a0c3a6-112f-7d20-9ddc-8d0d7cfc7121`，type=dev）
- codegraph：`ChungusHub`（查询前看 freshness；stale 先 sync。索引基线 HEAD `0a6ba0f`）
- 文档基线：HEAD `0a6ba0f49678a755a9fa663c8cd4de574caebe37`（2026-09-24 全量建档时点）

## 文档清单（11 篇，doc_get 按 id 一跳直达）

| title | category | doc_id |
|---|---|---|
| 项目概览 | 总览 | `01a0d317-78dc-75f3-98b3-2a342f7b1c4b` |
| 术语表 | 总览 | `01a0d334-4343-78e2-84fa-551ec19b3aa6` |
| 系统上下文 | 架构与实现 | `01a0d320-38e3-7ac0-a669-459a2e4d68b1` |
| 模块地图 | 架构与实现 | `01a0d31b-09c9-78c1-ad78-e011ce553c59` |
| 数据模型 | 架构与实现 | `01a0d31c-093d-78e2-a5a4-6a6a766fd6ba` |
| API 与接口 | 架构与实现 | `01a0d319-5016-70e3-bf0a-2e2435589143` |
| 运行时视图 | 架构与实现 | `01a0d323-37b7-75b0-bc2a-a315ff58c9f9` |
| 部署与运维 | 运维 | `01a0d331-a9bc-7271-9bbc-5612b4d1cdf6` |
| 测试与门禁 | 运维 | `01a0d33f-4333-74a0-bab6-5f2ec2e4d947` |
| 技术决策记录 | 决策 | `01a0d338-21de-7852-995f-9454d5bb6c41` |
| 风险与技术债 | 历史 | `01a0d334-6c8f-7db1-91e0-69fc23baa6f5` |
| 开工记录 2026-09-24 | 历史 | `01a0d31d-f850-7963-883c-f7d9e545d0cf` |
| 中文化开工记录 2026-09-24 | 历史 | `01a0d681-f040-7db0-b68e-fe00575e78e0` |
| i18n 术语对照表 | 规划 | `01a0d35e-9532-7913-9f76-bb05b86dd6ed` |

## 图清单（10 张，projects file_get 按名取；Web 项目页直接渲染）

| 文件 | 内容 |
|---|---|
| `diagram-01-context.html` | C4-L1 系统上下文（本系统 × 用户浏览器/14 家 LLM 上游/GitHub/文件系统） |
| `diagram-02-modules.html` | 模块依赖图（入口层/服务层/数据层） |
| `diagram-03-er.html` | ER 图（18 表五簇：chat core / library+world / memory / assistant / meta） |
| `diagram-04-arch.html` | 容器/分层架构（Bun 单进程内嵌） |
| `diagram-05-seq-bootstrap.html` | 时序：系统启动（migration/instance-lock/rebind） |
| `diagram-05-seq-llm-stream.html` | 时序：LLM 流式生成主干回合 |
| `diagram-05-seq-backup-restore.html` | 时序：备份快照与恢复（维护模式） |
| `diagram-05-seq-llm-retry.html` | 时序：错误/重试路径（EADDRINUSE/429/attach-miss） |
| `diagram-06-state.html` | 状态机：LLM 生成生命周期（live→settled→claimed/dropped，10min 窗口） |
| `diagram-07-deploy.html` | 部署拓扑（用户机器→安装目录→Bun 进程，:4242） |

## 检索配方（按意图直达）

- 架构怎么设计 → 模块地图 + diagram-02/04
- 这个接口是什么 → API 与接口（注意：其行号锚点有约 ±30 行系统性偏移，精确行号以源码搜索为准）
- 数据怎么存 → 数据模型 + diagram-03
- 一次生成怎么流 → 运行时视图 + diagram-05-*
- 怎么部署/配置 → 部署与运维 + diagram-07
- 测试怎么跑/门禁 → 测试与门禁
- 为什么这么定 → 技术决策记录
- 有什么坑 → 风险与技术债
- 术语黑话 → 术语表

## 已知瑕疵与纪律

- 《API 与接口》行号系统性偏移（内容已验真，行号勿直接信）
- 仓库自带 `architecture/`（英文 19 篇）与本档案并存：**engram 为权威**，仓库文档是历史参考；两边冲突以 engram + 源码核对为准
- 更新纪律：文档清单变化时同步更新本段（本段是快照，权威在 engram）；后续规划/决策走 plan-tree（`/plan`）
