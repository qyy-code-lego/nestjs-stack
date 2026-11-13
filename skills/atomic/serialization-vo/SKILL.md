---
name: serialization-vo
description: 全局 ClassSerializeInterceptor 按类装饰器序列化；接口返回默认用 VO class，通过模块内 vo-transform + plainToInstance 把 Service DTO 转 VO；禁止直接 return 普通对象充当 VO。
type: atomic
tags: [vo, serialization]
strict: true
when_to_use: 关键词 — vo, serialization, class-transformer, plainToInstance, exclude, expose, vo-transform
---


# 数据序列化与 VO ⚠️ Strict

工程全局启用 `ClassSerializeInterceptor`（基于 `class-transformer.instanceToPlain`），尊重类装饰器；之后 `DateSerializeInterceptor` 统一格式化 Date 字段并按 `x-timezone` 头转换时区。

## 1. 常用装饰器

- `@Exclude()` — 隐藏字段，不出现在响应 JSON
- `@Expose()` — 暴露字段；常用于 getter 虚拟属性
- `@Transform()` — 自定义序列化逻辑

## 2. Entity-Extension VO 模式

接口需要特殊展现（隐藏字段 / 虚拟属性）但不污染 Entity 时，**继承 Entity** 写 VO：

```typescript
export class AgentDetailVO extends OpAgent {
  @Exclude() users: any;       // 覆写父类，本接口隐藏

  @Expose()
  get agentAccount() {
    return this.users?.[0]?.identity?.opAccount;
  }
}

// agent.vo-transform.ts
export function toAgentDetailVO(data: OpAgent): AgentDetailVO {
  return plainToInstance(AgentDetailVO, data);
}

// Controller
@Get('detail')
async getDetail(@Query('id') id: string): Promise<AgentDetailVO> {
  const data = await this.service.getDetail(id);
  return toAgentDetailVO(data);
}
```

## 3. DTO/VO 分层规范（默认）

每个 NestJS 业务模块按下列方式组织：

```text
apps/{app}/src/{module}/
├── dto/
│   └── {module}.dto.ts          # 请求 DTO，Controller -> Service 的入参
├── vo/
│   └── {module}.types.ts        # 响应 VO 类型
├── {module}.controller.ts
├── {module}.service.ts
└── {module}.vo-transform.ts     # Service DTO/Entity -> VO
```

| 规则 | 内容 |
| - | - |
| Service | 仅返回 DTO/Entity/聚合对象，**禁止依赖 vo-transform** |
| vo-transform | 仅 Controller 层调用，组装展示态字段 |
| Controller | 必须显式声明返回类型（VO 或 DTO） |
| VO | **必须是 class**，不要用 interface 充当最终 HTTP 返回类型 |
| 转换方式 | 默认用 `plainToInstance(TargetVO, data)`，不要普通 `return { ... }` 冒充 VO |
| 简单结构 | 可直接返回 Service DTO，但谨慎使用 |

## 4. DTO -> VO 示例

```typescript
// service：纯净 DTO
export interface UserDetailDTO { id: string; name: string; internalStatus: number; }

// vo/user.types.ts
export class UserDetailVO {
  id: string;
  name: string;
  statusText: string;
}

// user.vo-transform.ts
import { plainToInstance } from 'class-transformer';

export function toUserDetailVO(dto: UserDetailDTO): UserDetailVO {
  return plainToInstance(UserDetailVO, {
    id: dto.id,
    name: dto.name,
    statusText: dto.internalStatus === 1 ? '启用' : '禁用',
  });
}

// controller
@Get('detail')
async detail(@Query('id') id: string): Promise<UserDetailVO> {
  return toUserDetailVO(await this.userService.getDetail(id));
}
```

## 5. 不要做

- 不要在 Controller 里手写大段展示态对象组装，提取到 `{module}.vo-transform.ts`
- 不要把 `interface` 当成响应 VO 的最终承载类型
- 不要直接返回普通对象后期待 `@Exclude` / `@Expose` 生效

## 相关 skill

- `service-paradigm` — Service 不构造展示态
- `dict-json` — 业务字典 text/path 可在 `vo-transform` 中组装
- `dto-validation` — 请求侧 DTO 校验
