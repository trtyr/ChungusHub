# ChungusHub（二开版）

> **Fork 声明**：本项目 fork 自 [patcireamo/ChungusHub](https://github.com/patcireamo/ChungusHub)（AGPL-3.0），在其基础上做了大量二次开发。感谢原作者打下的地基，上游原版请移步原仓库；本仓库的持续改动以本 README 为准。许可证沿用 AGPL-3.0（见 [LICENSE](LICENSE)）。

ChungusHub 是一个本地优先、隐私导向的长篇角色扮演 LLM 前端。角色卡、世界书、用户人设直接使用 SillyTavern 的格式，存量库基本无痛导入。聊天是树而不是一条线：编辑和重掷会产生分支而不是覆盖，故事地图帮你在分支里认清自己的位置。

## 相对上游的主要改动

我们在上游基础上实现/重构的部分：

- **ST 预设兼容层**：导入自动转换（清单顺序、标记宏、正则脚本搬运、采样器落地连接设置），并自动生成可用的**变量控件面板**与**条目开关**（对应酒馆 prompt manager 的勾选体验）。
- **变量宏引擎**：`setvar`/`getvar`/`if` 条件分支/速记操作符/随机宏，语义对齐 SillyTavern。
- **美化渲染**：预设 `<style>` 受控放行并做消息级 CSS 作用域化（安全红线：script、内联事件、`position:fixed` 全剥）；完整 HTML 文档型代码块渲染为 `sandbox=""` iframe，脚本天然惰性。
- **记忆系统**：情景摘要（分层折叠、分支感知覆盖）+ **事实板**（路径派生的会话状态板，回退/分支零写冲突）+ **事实维护 Agent**（JSON 工具循环自主合并/精炼/清理，pinned 行服务端铁律保护）。
- **回复建议**：卡住时一键取四个不同方向的候选回复，点选填入不自动发送。
- 大量工程修复：i18n 循环依赖、特殊 token 计价崩溃、默认上下文 1M / 输出 65535 等。

## 上游已有的核心能力（沿用并增强）

- 树状聊天：编辑/重掷分支化，故事地图导航。
- 预设控制：作者级控件，用户不开构建器也能调预设。
- 预设卡片：预设导出为 PNG，正面是画，内里是文档。
- Prompt 调试面板：每次请求与响应都落库，token 计数与供应商上报对账。
- Chungus Assistant：内嵌助手，可读记忆状态、改写摘要文本。

## On SillyTavern

这个项目欠 SillyTavern 不止一句提及。它说 SillyTavern 的格式，因为那是大家手里已经有的库。本项目**不是** SillyTavern 的 fork，不共享其任何代码。

---

> [!NOTE]
> 以下内容面向从源码运行与开发。只想用应用的话，从 Release 页面拿构建即可。

## Getting started

### Requirements

[Bun](https://bun.sh/) 1.3.9 或更新版本。

```sh
# Windows (PowerShell)
powershell -c "irm bun.sh/install.ps1 | iex"

# Linux / macOS
curl -fsSL https://bun.sh/install | bash
```

### Run it

```sh
git clone https://github.com/trtyr/ChungusHub.git
cd ChungusHub
bun install --frozen-lockfile
bun run start
```

然后打开 <http://localhost:4242>。数据存在仓库旁的 `user-data/` 里。

默认只监听 loopback。需要从其他设备访问时，在 设置 → 安全 里打开网络访问。

### Develop

开发是两个进程，各管一半。分两个终端跑：

```sh
bun run server:dev   # server on :4242, restarts itself when server code changes
bun run dev          # client on :1420, hot reload
```

### Tests / Gates

```sh
bun test        # 全量套件（含真实 ST 预设回归，文件在本机时自动启用）
bun run check   # svelte-check
bun run build   # 生产构建
```

## License

[AGPL-3.0](LICENSE)。本 fork 沿用上游许可证。
