# 合同智能筛选 Agent 设计方案

日期：2026-06-28

## 概要

建设一个合同智能筛选 Agent。用户登录后进入合同筛选工作台，通过自然语言描述筛选目标，后端基于已解析的合同知识库执行筛选任务，并返回以合同为单位的筛选结果和可追溯证据。

UI 必须遵循现有 Open Design 原型：

`/Users/liyuanxin/Library/Application Support/Open Design/namespaces/release-stable/data/projects/13d03357-ba9c-44d0-8ad1-9050ebc75d32`

该原型已经是独立的 Vite + React 项目。它应作为第一阶段的 UI 基线。实现时保留三栏工作台、对话式输入、合同结果卡片、证据详情面板等交互，只把 mock 数据和本地筛选逻辑替换为 RAGFlow 后端 API。

## 核心决策

1. 合同 Agent 前端保持独立的 Vite React 源码边界。
2. 生产环境不是两个用户可见的前端服务，而是在同一个 RAGFlow 站点下部署。
3. 合同 Agent 构建产物挂载到 `/contract-agent`。
4. RAGFlow 继续作为登录、权限、知识库、PDF 解析、OCR、Chunks、检索和 LLM 配置的事实来源。
5. OCR 默认走已配置的远程 PaddleOCR。
6. 筛选结果以“合同列表优先”展示，选中合同后在右侧面板查看证据。
7. 第一阶段采用可控的结构化筛选流水线，不做开放式自主多 Agent 流程。

## 非目标

- 第一阶段不把 Open Design 原型合并进 RAGFlow 主前端 `web/`。
- 不重写原型视觉设计。
- 第一阶段不引入 CSS Modules 或作用域 CSS，继续使用原型的 `src/styles.css`。
- 不筛选尚未完成解析的合同。
- 不建设独立账号系统。
- 不把原始 Chunk 列表作为主结果视图。

## 部署形态

开发阶段可以让合同 Agent 使用自己的 Vite dev server，便于快速调试：

```text
RAGFlow 主前端开发地址：  http://127.0.0.1:8000
合同 Agent 开发地址：    http://127.0.0.1:5173
RAGFlow API/后端：       http://127.0.0.1:9380
```

生产阶段对用户只暴露一个站点：

```text
/                  -> 现有 RAGFlow 前端
/contract-agent    -> 合同智能筛选 Agent 前端
/api/...           -> 现有和新增的 RAGFlow 后端 API
```

合同 Agent 的构建产物可以复制到 RAGFlow/Nginx 的静态资源路径下。用户不需要感知它在源码层面是独立前端项目。

## 登录与入口

合同 Agent 复用现有 RAGFlow 登录 session 或 token。登录成功后，可以通过配置开关默认跳转到 `/contract-agent`。

建议配置：

```text
CONTRACT_AGENT_ENABLED=true
CONTRACT_AGENT_DEFAULT_ROUTE=/contract-agent
```

关闭该开关时，RAGFlow 保持原有登录跳转行为。

## 前端设计

Open Design 原型作为第一阶段 UI 基线。当前结构映射到生产行为如下。

### 原型文件

- `src/App.jsx`：三栏工作台、对话流、结果卡片、证据面板。
- `src/styles.css`：设计 token、布局、响应式行为、组件样式。
- `src/data.js`：mock 合同数据和 Prompt 示例。
- `src/logic.js`：本地 mock 筛选和审计文本工具。
- `src/logic.test.js`：当前本地逻辑测试。

### UI 区域

实现后继续保留：

- 顶部栏：产品标识、历史面板开关、证据面板开关。
- 左侧面板：对话历史。
- 中间面板：Prompt 输入、任务流式阶段、合同结果卡片。
- 右侧面板：选中合同的证据详情和建议动作。
- Toast：复制、加入待办、失败反馈等轻提示。

### 相对原型的行为变化

视觉布局不变，数据行为变化：

- `src/data.js` 只作为开发 mock 数据。
- `smartFilter` 和本地筛选逻辑替换为 API 调用。
- 流式阶段由后端任务状态驱动。
- 合同卡片渲染后端筛选结果。
- 证据面板渲染后端返回的证据字段。
- 第一阶段对话历史本地持久化，第二阶段再迁移到后端持久化。

## 后端 API

新增一组小而独立的合同筛选 API。不要改变现有知识库、文档、Chunk 或检索 API 的语义。

### 创建筛选任务

`POST /api/v1/contract-screening/tasks`

请求：

```json
{
  "kb_id": "knowledge-base-id",
  "prompt": "筛选出付款周期超过60天且包含违约金条款的合同",
  "filters": {
    "risk": "全部",
    "status": "全部",
    "source": "全部"
  }
}
```

响应：

```json
{
  "code": 0,
  "data": {
    "task_id": "screening-task-id"
  }
}
```

### 查询任务状态

`GET /api/v1/contract-screening/tasks/{task_id}`

响应：

```json
{
  "code": 0,
  "data": {
    "task_id": "screening-task-id",
    "status": "running",
    "phase": "review_evidence",
    "progress": 0.68,
    "message": "正在复核合同证据"
  }
}
```

允许的任务状态：

- `pending`
- `running`
- `done`
- `failed`
- `cancelled`

允许的任务阶段：

- `parse_prompt`
- `retrieve_candidates`
- `review_evidence`
- `rank_contracts`
- `generate_summary`

### 获取筛选结果

`GET /api/v1/contract-screening/tasks/{task_id}/results`

响应：

```json
{
  "code": 0,
  "data": {
    "task_id": "screening-task-id",
    "prompt": "筛选出付款周期超过60天且包含违约金条款的合同",
    "strategy": [
      "字段过滤：限定已解析完成的合同文档",
      "语义召回：检索付款周期、账期、违约金、逾期责任相关条款",
      "证据复核：按合同聚合证据并判断条件是否满足",
      "综合排序：按命中条件、置信度和风险等级排序"
    ],
    "items": [
      {
        "id": "document-id",
        "title": "采购合同.pdf",
        "supplier": "上海曜石科技有限公司",
        "owner": "采购部",
        "status": "命中",
        "risk": "高",
        "amount": "¥4,860,000",
        "expiry": "2026-09-30",
        "score": 92,
        "permissions": "采购部、法务部可见",
        "reason": "该合同付款周期为90天，并包含逾期违约金条款。",
        "evidence": [
          {
            "source": "合同正文",
            "ref": "第12页 / chunk-1",
            "text": "付款期限为验收合格后90日内...",
            "page": 12,
            "chunk_id": "chunk-1"
          }
        ],
        "actions": [
          "请求法务复核付款及违约责任条款"
        ],
        "timeline": [
          ["到期", "2026-09-30"],
          ["付款周期", "90天"]
        ]
      }
    ]
  }
}
```

### 可选的证据详情接口

如果第一阶段结果 payload 过大，可以把证据详情拆到独立接口：

`GET /api/v1/contract-screening/documents/{document_id}/evidence?task_id={task_id}`

前端交互不变：用户点击合同结果卡片后，右侧证据面板展示详情。

## 筛选流水线

第一阶段采用可控流水线：

1. 校验用户身份和知识库权限。
2. 将自然语言 Prompt 解析为筛选意图和筛选条件。
3. 限定候选文档为已经解析完成且有 Chunk 的合同。
4. 复用 RAGFlow 现有检索能力召回候选 Chunk。
5. 按文档聚合候选 Chunk。
6. 调用已配置 LLM，逐份合同判断是否满足筛选条件。
7. 生成合同级摘要、置信度和证据列表。
8. 持久化任务状态和结果。
9. 向前端返回合同列表优先的结果。

流水线优先保证可解释性，而不是自主性。每一份命中的合同都必须有证据引用。如果某个条件无法核验，结果应明确说明“证据不足”，不能编造结论。

## OCR 与知识库流程

合同文件继续走 RAGFlow 现有知识库流程：

1. 用户将 PDF 上传到合同知识库。
2. 后端默认使用远程 PaddleOCR 解析 PDF。
3. 解析后的文本进入 Chunk 切分和索引。
4. 合同 Agent 只筛选解析完成的文档。
5. 尚在解析中的文档不进入候选集，并在任务元信息中说明被跳过数量。

现有远程 PaddleOCR 配置继续作为默认 OCR 路径。系统不再默认加载本地 OCR。

## 错误处理

前端行为：

- Prompt 为空时，发送按钮禁用。
- 未选择知识库时，给出明确操作提示。
- 任务失败时，在对话中展示后端失败信息。
- 没有命中合同时，展示正常空结果，不按错误处理。
- 知识库部分文档尚未解析完成时，展示被跳过的文档数量。
- 登录过期时，跳转回 RAGFlow 登录页。

后端行为：

- Prompt 无效时返回用户可读的校验错误。
- 知识库不存在或无权限时返回权限错误。
- 没有已解析文档时返回成功的空结果，并包含跳过数量。
- LLM 调用失败时任务标记为失败，并保留错误信息。
- 检索失败时任务标记为失败，不返回伪造结果。

## 测试

前端测试：

- API adapter 能把后端字段映射为现有合同卡片和证据面板结构。
- 提交 Prompt 后能创建任务并开始轮询。
- 任务进入 `done`、`failed` 或 `cancelled` 后停止轮询。
- 选择结果卡片后能更新右侧证据面板。
- 空结果和失败状态能正确渲染。

后端测试：

- 创建任务时校验 `kb_id` 和 `prompt`。
- 筛选时排除未解析完成的文档。
- Prompt 解析器能返回结构化条件。
- 检索候选能按文档聚合。
- LLM 判断结果能归一化为合同级结果。
- 结果包含文档 ID、Chunk ID、页码和证据文本。
- 权限校验能阻止跨租户访问。

集成检查：

- 上传 PDF，通过远程 PaddleOCR 完成解析，等待 Chunks 生成后运行筛选 Prompt，前端能看到合同卡片和证据。
- 只有开启功能开关时，登录后才默认跳转 `/contract-agent`。
- 生产构建产物可以挂载在 `/contract-agent` 下访问。

## 分阶段计划

第一阶段：

- 基于 Open Design 原型新增合同 Agent 前端源码边界。
- 新增后端合同筛选任务 API。
- 用 API 驱动的任务创建、轮询和结果替换 mock 数据。
- 将构建产物挂载到 `/contract-agent`。
- 增加可配置登录跳转。

第二阶段：

- 按用户持久化任务历史。
- 支持导出 Excel 或 Word。
- 支持 Prompt 解析后编辑条件。
- 增加结果反馈，用于后续调优。

第三阶段：可信检索与正式筛选报告。

- 增加多轮澄清能力，将含糊筛选目标补全为结构化筛选意图。
- 增加合同元数据抽取和标准化字段，包括项目名称、合同类型、供应商、金额、期限、审批状态和履约状态。
- 建设结构化查询计划，明确标题匹配、元数据过滤、关键词召回、语义召回和 Chunk 级证据召回的执行顺序。
- 增加多路召回和重排能力，合并标题、元数据、BM25/关键词、向量语义和证据片段结果。
- 增加可解释匹配度和风险评分模板，展示项目命中、合同类型命中、语义相关性、证据质量和元数据一致性的分项贡献。
- 建立条件级证据映射，说明每个筛选条件命中了哪些证据、哪些条件证据不足或未命中。
- 生成正式筛选报告，包含查询意图、检索计划、执行统计、结果排序原因、证据引用和风险评分。
- 使用第二阶段沉淀的反馈数据进入检索、排序和证据质量调优闭环。

## 风险与缓解

- 风险：如果直接合并进 RAGFlow `web/`，可能产生 CSS 冲突。
  - 缓解：保持源码和构建产物独立，挂载到 `/contract-agent`。

- 风险：LLM 返回缺少证据支持或编造的结论。
  - 缓解：要求结论必须引用检索到的 Chunk 证据，拒绝无证据结论。

- 风险：OCR 和解析耗时较长，用户误以为筛选失败。
  - 缓解：展示解析状态，跳过未解析文档，并说明跳过数量。

- 风险：认证体系重复建设。
  - 缓解：使用现有 RAGFlow session/token，并同域部署。

- 风险：结果过于 Chunk 化，不符合业务用户习惯。
  - 缓解：坚持合同列表优先，证据只在详情面板中展开。

## 已确认方向

已确认的产品方向：

- UI 按现有 Open Design 原型实现。
- 合同 Agent 前端源码保持独立。
- 生产部署在同一个 RAGFlow 站点下，路径为 `/contract-agent`。
- 复用 RAGFlow 登录和后端服务。
- 筛选结果按合同列表优先展示，并提供可追溯证据。
