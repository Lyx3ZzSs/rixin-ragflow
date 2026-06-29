# 合同智能筛选 Agent 第二阶段优化设计

日期：2026-06-29

## 概要

第二阶段将合同智能筛选 Agent 从“一次性筛选任务”升级为“可保存、可复查、可调整、可导出、可反馈”的业务工作台。

第一阶段已经完成独立前端、任务创建、任务轮询、合同级结果展示、证据面板和 `/contract-agent` 挂载。当前任务状态和结果主要保存在 Redis 中，前端历史仍以本地状态为主。第二阶段不扩展开放式多 Agent 能力，而是补齐业务闭环和可运营数据。

## 目标

1. 按租户和用户持久化筛选任务历史。
2. 支持 Prompt 自动解析为结构化筛选条件，并在用户点击发送后直接启动筛选任务。
3. 支持筛选结果导出 Excel 和 Word。
4. 增加合同结果和证据反馈，为后续调优沉淀数据。
5. 增强任务、导出和反馈的权限隔离、测试和可观测性。

## 非目标

- 不做多轮澄清对话。
- 不引入开放式自主多 Agent 流程。
- 不建设正式风险评分模板。
- 不做完整合同元数据抽取和标准化字段体系。
- 不生成第三阶段所需的正式筛选报告。
- 不把 `contract-agent-web/` 合并进主前端 `web/`。

## 核心决策

1. 第二阶段采用“产品闭环优先”路线，优先交付历史、自动条件解析、导出和反馈。
2. Redis 继续用于运行中任务的短期状态更新，数据库作为历史任务、结果、证据、导出和反馈的事实来源。
3. 条件解析发生在任务创建前，但不阻塞用户流程：前端先解析 Prompt，再直接提交结构化条件创建筛选任务。运行前条件编辑不作为第二阶段主流程，后续可作为高级筛选或复跑能力补充。
4. 导出先支持 Excel，再支持 Word。两种格式复用同一导出任务模型。
5. 反馈只负责采集和查询，不在第二阶段自动训练模型或自动改变排序策略。

## 数据模型

新增数据库实体应使用现有 RAGFlow 服务层和模型模式，命名保持 `contract_screening_*` 前缀。

### contract_screening_task

保存筛选任务主记录。

建议字段：

- `id`: task id。
- `tenant_id`: 租户 id。
- `user_id`: 发起用户 id。
- `kb_id`: 知识库 id。
- `prompt`: 原始 Prompt。
- `filters`: 用户提交的基础过滤条件，JSON。
- `parsed_conditions`: Prompt 解析后的结构化条件，JSON。
- `edited_conditions`: 任务创建时提交的结构化条件，JSON。第二阶段默认由 Prompt 自动解析得到。
- `evidence_policy`: 证据策略，JSON。
- `status`: `pending`、`running`、`done`、`failed`、`cancelled`。
- `phase`: 当前阶段。
- `progress`: 进度。
- `message`: 用户可读状态。
- `error`: 失败信息。
- `item_count`: 结果数量。
- `skipped`: 跳过文档统计，JSON。
- `created_at`: 创建时间。
- `updated_at`: 更新时间。
- `finished_at`: 完成时间。

索引：

- `(tenant_id, user_id, created_at)` 支持用户历史列表。
- `(tenant_id, kb_id, created_at)` 支持知识库级排查。
- `(tenant_id, status, updated_at)` 支持运行中任务巡检。

### contract_screening_result

保存合同级筛选结果。

建议字段：

- `id`: result id。
- `task_id`: 筛选任务 id。
- `tenant_id`: 租户 id。
- `document_id`: 合同文档 id。
- `title`: 合同标题。
- `status`: 命中状态。
- `risk`: 风险等级。
- `score`: 综合分。
- `reason`: 命中原因。
- `meta`: 供应商、金额、到期日、权限等展示字段，JSON。
- `actions`: 建议动作，JSON。
- `timeline`: 时间线，JSON。
- `created_at`: 创建时间。

索引：

- `(tenant_id, task_id, score)` 支持结果读取和排序。
- `(tenant_id, document_id, created_at)` 支持后续文档维度分析。

### contract_screening_evidence

保存证据条目。

建议字段：

- `id`: evidence id。
- `task_id`: 筛选任务 id。
- `result_id`: 合同结果 id。
- `tenant_id`: 租户 id。
- `document_id`: 合同文档 id。
- `chunk_id`: Chunk id。
- `source`: 证据来源。
- `ref`: 展示引用。
- `page`: 页码。
- `text`: 证据文本。
- `score`: 证据分。
- `condition_id`: 关联筛选条件。
- `created_at`: 创建时间。

索引：

- `(tenant_id, task_id, result_id)` 支持证据面板。
- `(tenant_id, chunk_id)` 支持反馈和排查。

### contract_screening_export

保存导出任务。

建议字段：

- `id`: export id。
- `task_id`: 筛选任务 id。
- `tenant_id`: 租户 id。
- `user_id`: 创建用户 id。
- `format`: `excel` 或 `word`。
- `status`: `pending`、`running`、`done`、`failed`。
- `file_name`: 文件名。
- `file_key`: 对象存储 key 或本地文件引用。
- `error`: 失败信息。
- `created_at`: 创建时间。
- `updated_at`: 更新时间。

### contract_screening_feedback

保存用户反馈。

建议字段：

- `id`: feedback id。
- `task_id`: 筛选任务 id。
- `result_id`: 合同结果 id，可为空。
- `evidence_id`: 证据 id，可为空。
- `tenant_id`: 租户 id。
- `user_id`: 反馈用户 id。
- `feedback_type`: `correct_match`、`false_positive`、`false_negative`、`insufficient_evidence`、`useful_evidence`、`irrelevant_evidence`、`wrong_page`。
- `comment`: 用户备注。
- `created_at`: 创建时间。

## 后端 API

### 解析 Prompt

`POST /api/v1/contract-screening/parse`

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
    "query": "筛选出付款周期超过60天且包含违约金条款的合同",
    "conditions": [
      {
        "id": "payment_terms",
        "label": "付款周期超过60天",
        "keywords": ["付款周期", "账期", "60天"],
        "operator": "gt",
        "value": "60天",
        "enabled": true
      },
      {
        "id": "penalty_terms",
        "label": "包含违约金条款",
        "keywords": ["违约金", "逾期责任"],
        "operator": "exists",
        "value": "",
        "enabled": true
      }
    ],
    "filters": {
      "risk": "全部",
      "status": "全部",
      "source": "全部"
    },
    "evidence_policy": {
      "group_by": "document",
      "max_evidence_per_contract": 5
    }
  }
}
```

解析接口必须复用第一阶段 `build_strategy` 的可控规则作为保底逻辑。LLM 解析可以作为增强，但失败时不能阻塞用户继续运行。

### 创建任务

`POST /api/v1/contract-screening/tasks`

第二阶段扩展请求体，允许提交 Prompt 自动解析后的条件：

```json
{
  "kb_id": "knowledge-base-id",
  "prompt": "筛选出付款周期超过60天且包含违约金条款的合同",
  "filters": {
    "risk": "全部",
    "status": "全部",
    "source": "全部"
  },
  "conditions": [
    {
      "id": "payment_terms",
      "label": "付款周期超过60天",
      "keywords": ["付款周期", "账期", "60天"],
      "operator": "gt",
      "value": "60天",
      "enabled": true
    }
  ],
  "evidence_policy": {
    "group_by": "document",
    "max_evidence_per_contract": 5
  }
}
```

第一阶段请求格式继续兼容。未提交 `conditions` 时，后端使用 Prompt 自动解析结果。前端默认在发送后自动调用解析接口，并将解析结果随创建任务请求提交，不再展示运行前确认框。

### 历史列表

`GET /api/v1/contract-screening/tasks?page=1&page_size=20&kb_id=optional`

响应：

```json
{
  "code": 0,
  "data": {
    "total": 1,
    "items": [
      {
        "task_id": "task-id",
        "kb_id": "knowledge-base-id",
        "prompt": "筛选出付款周期超过60天且包含违约金条款的合同",
        "status": "done",
        "phase": "generate_summary",
        "progress": 1,
        "message": "筛选完成",
        "item_count": 12,
        "created_at": 1782720000,
        "updated_at": 1782720300,
        "finished_at": 1782720300
      }
    ]
  }
}
```

历史列表只返回当前登录用户可见任务。管理员视角不在第二阶段实现。

### 获取结果

`GET /api/v1/contract-screening/tasks/{task_id}/results`

第二阶段结果优先从数据库读取。运行中的任务可以继续从 Redis 读取状态，但完成后的结果必须已落库。

### 创建导出

`POST /api/v1/contract-screening/tasks/{task_id}/exports`

请求：

```json
{
  "format": "excel"
}
```

响应：

```json
{
  "code": 0,
  "data": {
    "export_id": "export-id",
    "status": "pending"
  }
}
```

### 获取导出

`GET /api/v1/contract-screening/exports/{export_id}`

导出完成后返回下载地址或触发文件响应。下载前必须校验 `tenant_id`、`user_id` 和任务访问权限。

### 提交反馈

`POST /api/v1/contract-screening/tasks/{task_id}/feedback`

请求：

```json
{
  "result_id": "result-id",
  "evidence_id": "evidence-id",
  "feedback_type": "irrelevant_evidence",
  "comment": "该证据只说明付款方式，没有说明付款周期。"
}
```

响应：

```json
{
  "code": 0,
  "data": {
    "feedback_id": "feedback-id"
  }
}
```

## 前端行为

### 历史面板

左侧历史从本地 mock 和本地状态切换为后端历史列表。

行为要求：

- 页面加载后请求历史列表。
- 点击历史项加载任务结果和证据。
- 新建筛选不会丢失历史。
- 删除历史不是第二阶段必需能力；如果保留删除按钮，应只做本地隐藏或在后端实现软删除，不能硬删结果数据。

### 条件解析

用户输入 Prompt 并点击发送后，前端先调用解析接口，然后直接创建筛选任务。

解析行为要求：

- 解析结果包含结构化 `conditions` 和 `evidence_policy`。
- 前端将解析后的条件随创建任务请求提交。
- 解析失败时显示可读错误，不创建任务。
- 第二阶段不展示运行前条件确认框，不要求用户二次点击“开始筛选”。
- 条件编辑能力保留为后续高级筛选或历史任务复跑能力，不作为第二阶段验收门槛。

### 导出

任务完成后显示导出入口。

导出行为：

- Excel：导出合同级结果和证据明细。
- Word：导出筛选说明、条件、结果摘要、逐合同证据。
- 导出进行中显示状态。
- 导出失败显示后端错误。
- 未完成任务不能导出。

### 反馈

合同卡片支持结果反馈：

- 正确命中。
- 误命中。
- 证据不足。

证据面板支持证据反馈：

- 有用。
- 无关。
- 页码错误。

反馈提交成功后显示轻提示。第二阶段不需要复杂的反馈编辑和撤销。

## 导出格式

### Excel

工作表：

1. `筛选摘要`
   - Prompt。
   - 知识库。
   - 筛选条件。
   - 任务状态。
   - 命中数量。
   - 跳过文档数量。

2. `合同结果`
   - 合同名称。
   - 文档 id。
   - 命中状态。
   - 风险。
   - 分数。
   - 原因。
   - 建议动作。

3. `证据明细`
   - 合同名称。
   - 文档 id。
   - 条件 id。
   - 页码。
   - Chunk id。
   - 证据文本。

### Word

章节：

1. 筛选任务说明。
2. 筛选条件。
3. 结果摘要。
4. 命中合同列表。
5. 逐合同证据。
6. 跳过和失败说明。

Word 导出应保持朴素、可读、可打印，不做复杂版式。

## 权限与安全

所有新增接口必须校验：

- 当前用户已登录。
- 当前用户属于任务的 `tenant_id`。
- 当前用户可访问任务关联知识库。
- 导出文件只允许创建者或具备任务访问权限的用户下载。
- 反馈只能提交到当前用户可访问的任务、结果和证据。

导出内容不得包含用户无权查看的合同和证据。历史列表不能泄露其他用户或其他租户任务。

## 可观测性

第二阶段记录以下指标，先通过日志和数据库字段满足排查需求：

- 任务创建时间、开始时间、完成时间。
- 每个任务的结果数量、证据数量、跳过文档数量。
- 解析失败、检索失败、导出失败原因。
- 导出格式和耗时。
- 反馈类型统计。

## 测试

### 后端单测

- Prompt 解析接口校验 `kb_id` 和 `prompt`。
- Prompt 解析接口在 LLM 失败时返回规则解析结果。
- 创建任务兼容第一阶段请求体。
- 创建任务保存 Prompt 自动解析后的条件和证据策略。
- 历史列表只返回当前用户可见任务。
- 结果读取优先读取数据库持久化结果。
- 导出任务校验任务状态和权限。
- Excel 导出包含摘要、合同结果和证据明细。
- Word 导出包含任务说明、条件、结果和证据。
- 反馈接口拒绝跨租户、跨任务、跨证据提交。

### 前端测试

- 历史面板从后端加载并能打开历史任务。
- 输入 Prompt 后直接启动筛选，不展示条件确认框。
- 创建任务请求包含自动解析后的条件和证据策略。
- 任务完成后显示导出入口。
- 导出成功和失败状态渲染正确。
- 合同卡片反馈提交成功后显示提示。
- 证据反馈提交时包含 `evidence_id`。

### 集成检查

- 用户完成一次筛选，刷新页面后仍能从历史打开结果。
- 用户发送 Prompt 后直接运行任务，后端保存自动解析后的条件。
- 完成任务可以导出 Excel。
- 完成任务可以导出 Word。
- 用户对合同结果和证据提交反馈后，数据库可查询到反馈记录。
- 另一个用户不能读取该任务、结果、导出和反馈。

## 分阶段实施

### M1：任务历史持久化

- 新增任务、结果、证据数据库模型和服务。
- 任务完成时写入数据库。
- 新增历史列表接口。
- 前端历史面板接入后端。

### M2：条件解析与自动运行

- 新增 Prompt 解析接口。
- 扩展创建任务接口，支持 `conditions` 和 `evidence_policy`。
- 前端发送后自动解析条件并直接创建筛选任务。
- 筛选任务使用自动解析后的条件。

### M3：导出能力

- 新增导出模型和导出服务。
- 实现 Excel 导出。
- 实现 Word 导出。
- 前端增加任务完成后的导出入口。

### M4：反馈闭环

- 新增反馈模型和反馈接口。
- 前端增加合同结果反馈和证据反馈。
- 后端记录反馈并支持基础统计查询。

### M5：质量加固

- 补齐权限、异常、空结果和跨用户测试。
- 增加关键日志和任务耗时记录。
- 验证 Redis 运行态和数据库历史态一致性。

## 验收标准

第二阶段完成时应满足：

1. 用户刷新页面后仍能看到自己的历史筛选任务。
2. 历史任务能重新打开，结果和证据不丢失。
3. 用户点击发送后不出现条件确认框，系统自动解析条件并直接启动筛选。
4. 一个完成任务能导出 Excel。
5. 一个完成任务能导出 Word。
6. 用户能对合同结果和证据提交反馈。
7. 跨租户、跨知识库、跨用户不能读取历史、结果、导出文件或反馈。
8. 后端单测覆盖任务持久化、权限、条件解析、导出和反馈。
9. 前端测试覆盖历史加载、条件解析直接运行、导出和反馈。

## 风险与缓解

- 风险：数据库持久化和 Redis 运行态出现不一致。
  - 缓解：运行中状态仍从 Redis 更新，任务完成后以数据库为准；完成写库失败时任务标记失败并保留错误。

- 风险：条件解析结果不可见，用户难以及时发现解析偏差。
  - 缓解：第二阶段在任务结果中保留并展示策略摘要；运行前编辑留作后续高级筛选或复跑能力。

- 风险：Word 导出版式投入过大。
  - 缓解：第二阶段只做朴素、可读、可打印版本，正式报告留到第三阶段。

- 风险：反馈采集后短期看不到收益。
  - 缓解：第二阶段只承诺数据沉淀和统计，调优策略进入第三阶段的可信检索、多路召回、重排和证据质量闭环。

- 风险：导出文件泄露无权证据。
  - 缓解：导出创建和下载都重新校验任务、知识库和租户权限，不复用前端传入结果。
