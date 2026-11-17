# dsh-prompt-expansion

[![CI](https://github.com/qing-gu-web/dsh-prompt-expansion/actions/workflows/ci.yml/badge.svg)](https://github.com/qing-gu-web/dsh-prompt-expansion/actions/workflows/ci.yml)
[![license](https://img.shields.io/github/license/qing-gu-web/dsh-prompt-expansion.svg)](LICENSE)
[![GitHub stars](https://img.shields.io/github/stars/qing-gu-web/dsh-prompt-expansion.svg)](https://github.com/qing-gu-web/dsh-prompt-expansion/stargazers)

[English](README.md) | 中文

一个 DeepSeek Harness 插件：把提示词改写得更清晰、更结构化、更可执行，同时不碰下游系统所依赖的部分。

你会拿到优化后的提示词、变更摘要、警告，以及一个复制按钮。你的原文不会被悄悄替换。

## 功能

- **输入框按钮** —— 输入框工具行里一个不带文字的闪光图标按钮。写好提示词点一下，草稿就地换成优化后的版本；旁边随即出现 **发送**，**撤销** 可恢复原草稿。
- **`optimize_prompt` 工具** —— 你要求改进某段提示词时，由 Agent 调用。返回优化结果与审计信息。
- **`/optimize` 命令** —— 你自己在输入框执行，不会生成一条模型消息。
- **结果卡片** —— 优化后文本、用于对比的原文、变更摘要、警告、一键复制。
- **受保护内容** —— 模板变量、代码、URL、引号内原文与数字先提取、后校验。只要会被破坏，就返回原文并说明原因。
- **安全回退** —— 任何失败路径都原样返回你的输入。

## 安装

**从 npm 装。**

```sh
dsh plugin add dsh-prompt-expansion
```

**在 DSH 的 Discover 里装。** 打开 **插件 → 发现 → 管理索引源**，添加本仓库的插件索引，然后从列表里点安装：

```
https://raw.githubusercontent.com/qing-gu-web/dsh-prompt-expansion/main/index.json
```

**从仓库源码装。** 克隆仓库，然后在应用里 **插件 → 添加插件** 指向该目录。本地目录安装是链接，改代码不用重装。

```sh
git clone https://github.com/qing-gu-web/dsh-prompt-expansion.git
```

如果插件行处于禁用状态请启用它，然后新建一个会话，让按钮、工具与命令完成注册。

## 使用

### 按钮

输入框自己的工具行里（模型选择器旁边）有一个闪光图标按钮，**不带文字**，图标就是标签。

1. 写好内容点一下闪光图标。它会变成一个转圈的圆环，期间只有一次模型调用；再点一下即取消。
2. 成功后草稿就地替换，闪光变成对勾，旁边出现两个动作：**发送** 直接把优化后的提示词发出去，**撤销** 恢复你原来写的内容。
3. 失败时不改动草稿，只把原因显示在按钮旁边。
4. 草稿为空、或正在发送消息时按钮禁用。优化后如果你又手动改了草稿，发送/撤销会自动消失，不会覆盖你的修改。

按钮使用配置里的 `mode`/`goal`/`template`。想临时换模板或目标，用下面的命令。

### 命令

```
/optimize 帮我把这段提示词改得更清楚：把用户上传的表格整理成摘要，别太长
```

```
/optimize --mode system --goal structure --template professional <你的系统提示词>
```

或者直接对 Agent 说：“帮我优化一下这个提示词：……”

| 参数 | 取值 |
|---|---|
| `--mode` | `user`（默认）、`system`、`message` |
| `--goal` | `clarity`（默认）、`structure`、`concise`、`professional`、`creative`、`technical` |
| `--template` | `generic`、`professional`、`analytical`、`concise`、`output-format`、`conversation`；省略则自动推荐 |
| `--format` | `structured`（默认：总起句 + 分层编号）或 `plain`（通顺散文） |
| `--lang` | `zh`、`en`；省略则跟随原文语言 |
| `--help` | 打印用法 |

### 输出形式

默认输出一份**规格说明**，而不是散文：一句总起句点明交付物，然后是 4–7 组编号要求，每组下面 1–4 条具体子项。

```
请开发一个功能完整、交互流畅的贪吃蛇游戏 HTML 程序，具体要求如下：
1. 技术栈：采用原生 HTML5 + CSS3 + JavaScript，不依赖第三方游戏引擎或外部库
   - 单文件交付，双击即可运行
   - 不引用任何外部资源
2. 核心玩法：方向键控制，吃到食物后增长并加分
   - 碰撞检测：撞边界或自身即结束
   ...
```

在结构之外，优化器会补齐这类任务通常都需要的实现细节 —— 单文件交付、记录持久化、暂停/取消、难度递增、可访问性、错误处理、文件结构、命名与注释。这些一律直接写成要求，不会标成“建议”“可选”。

仍然不会编造：事实、数据、人名、日期、链接、引用，也不会换掉任务本身。补齐工程惯例不等于可以编造内容，补上的细节不得与原文冲突。

用 `--format plain`（或配置 `format: plain`）改回通顺散文；用 `--goal concise` 保留编号但压到 3–5 组。

## 配置

配置写在插件行上，修改 profile 的 `cordis.patch.yml` 即可，无需重装：

```yaml
- id: dsh-prompt-expansion
  name: 'dsh-prompt-expansion'
  config:
    modelSource: host          # host | byok
    mode: user
    goal: clarity
    template: auto
    format: structured        # structured（分层编号）| plain（散文）
    language: auto             # auto | zh | en
    maxInputChars: 20000
    maxOutputChars: 24000
    timeoutMs: 60000
    temperature: 0.3
    maxTokens: 6000
    retryOnRateLimit: true
    cacheEnabled: true
    cacheTtlMs: 600000
    cacheMaxEntries: 64
    guideAgent: true
    composerButton: true       # 输入框下方的“优化”按钮
    debug: false
    byok:
      baseURL: 'https://api.deepseek.com/v1'
      apiKey: ''               # 建议改用下面的环境变量
      model: deepseek-chat
```

`modelSource: host` 使用 DSH 已选的模型，无需任何 Key；`modelSource: byok` 则调用你自备的 OpenAI 兼容端点。Key 优先读环境变量 `DSH_PROMPT_OPTIMIZER_API_KEY`，这样可以不写进补丁文件。

修改配置后插件会重启，下一次请求即使用新值。

## 隐私

- 提示词原文只会发送到一个地方：模型端点 —— DSH 配置的提供方，或你设置的 BYOK `baseURL`。没有遥测、没有分析、没有第三方请求。
- 输入框按钮只与本机 DSH 服务器上的插件路由（`/api/prompt-optimizer/optimize`）通信。该路由仅本安装的 owner peer 可访问，不对外暴露，且只把文本转发给模型端点。
- API Key 不写日志、不进结果；除了作为 bearer token 发给对应端点外，不出现在任何地方，也不会进入提示词。
- 原文与优化结果会作为普通工具结果记录在会话日志中（DSH 靠它渲染卡片与重放会话），本插件不会写到其他任何位置。
- 结果只缓存在内存中，默认十分钟；插件卸载即清空，`cacheEnabled: false` 可关闭。
- `debug: true` 只在启用时记录一行日志，不记录提示词或 Key。

## 明确不做

1. 不自动改写、不自动发送任何消息；每次运行都由你或你指派的 Agent 触发。
2. 不编造事实、数据、人名、日期、链接或引用。它会补齐这类任务通行的实现惯例（这正是结构化输出的意义），但这些补齐不得与原文冲突，且所选参数会列进“已假设”，方便你改。
3. 不修改代码块、变量、URL；保不住就返回原文。
4. 除模型端点外不发送原文。
5. 不声称输出“客观更好”；变更摘要只描述改了什么。
6. 不做无限扩写 —— `maxOutputChars` 是硬上限。
7. 不要求登录或绑定账号。

## 兼容性

| DSH 版本 | 状态 |
|---|---|
| `0.2.2-rc.3`（已实测） | 工具、命令、系统提示词段落、结果卡片 |
| `0.2.2-rc.1` / `0.2.2-rc.2` | 预期可用，未单独验证 |
| `< 0.2.2-rc.1` | 不支持 |

Host 半边不导入任何 `@deepseek-ai/*` 包（服务全部通过 Cordis 上下文读取），因此 profile 布局变化不会导致模块解析失败。Client 半边只从浏览器模块表取 `react`。

Node `^22.15.0 || >=24.0.0`，Cordis `>=4.0.0-rc <5`。

## 尚未实现

六维质量评分、模板导入导出、优化历史与收藏、A/B 对比、评估集与回归报告、团队模板包。工具与命令已经暴露 `template` 和 `goal`，后续加模板库不会改变它们的契约。

## 开发

```sh
npm test      # 50 项引擎/路由检查 + 6 种客户端 bundle 状态
npm run check # 检查每个随包发布模块的语法
```

测试使用模拟的 `ctx.llm` 流，不需要网络，也不需要 DSH 运行时。`CONTRIBUTING.md` 列了改动不得破坏的几条不变量；[docs/PUBLISHING.md](docs/PUBLISHING.md) 讲 npm 发布、社区目录与仓库自带的插件市场索引。

## 许可

MIT，见 [LICENSE](LICENSE)。

## 反馈

欢迎提交问题与模型兼容性报告。请附上 DSH 版本、提供方/模型、使用的 mode 与 goal，以及变更摘要 —— 但不要附 API Key 或不能公开的提示词。
