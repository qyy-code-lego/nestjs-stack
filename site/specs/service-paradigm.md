---
name: service-paradigm
description: Service 层四条强约束——上下文无关、interface 入参、>3 参数对象参数、查询分层；类型安全禁止 as any 与敏感信息独立接口。
tags: [service, paradigm, type-safety]
group: 数据层
---

# Service 层范式与类型安全 ⚠️ Strict

> ⚠️ Strict：本页为强约束，违反需审查。

Service 层有四条强约束，外加类型安全规范。目的是让 Service 可测试、上下文无关、查询与展示分离。

## 四条强约束

```typescript
@Injectable()
export class XxxService {
  constructor(
    private readonly repo: Repository<XxxEntity>,
    private readonly cacheService: CacheService,
    private readonly dataScopeEngine: DataScopeEngine,
  ) {}

  // ✅ 上下文无关：禁用 ThreadLocal / Request / Response
  // ✅ interface 入参，而非 DTO Class
  async findPage(param: FindXxxPageParam): Promise<IPageData<XxxEntity>> {
    // ✅ 查询分层：返回实体聚合，不构造展示态（VO 由 vo-transform 处理）
    // ✅ >3 参数用对象参数（param 即对象）
  }
}
```

| 约束 | 做法 |
| - | - |
| 上下文无关 | 禁用 ThreadLocal / Request / Response；account/identity/searcher 由 Controller 显式传入 |
| 参数类型 | 用 `interface` 而非 DTO Class |
| 参数个数 | 超过 3 个必须用对象参数模式 |
| 查询分层 | 优先 Entity Relation 查询，返回实体聚合，不构造展示态 |

> ⚠️ Strict：Service 不依赖 vo-transform；软删不过滤手拼 `deletedAt IS NULL`。

## 类型安全

```typescript
// ✅ ALS 取值第一行显式断言为业务类型
const account = this.threadLocal.get('account') as Account;

// ❌ 禁止随意 as any 绕过编译
const x = data as any;
```

- 严禁随意 `as any`；ALS 取值应在第一时间显式断言为业务实体类型。
- 优先复用已有 Entity / DTO / Type，不重复定义。
- 修改后必须 `eslint` + `tsc` 通过。

## 敏感信息

密码等敏感字段更新必须独立接口与独立 Service 方法，不混入综合维护接口：

```typescript
// 独立接口 + 独立方法
@Patch('/password')
resetPassword(@Query('id') id: string, @Body() dto: ResetPasswordDto) {}

async resetPassword(id: string, pwd: string): Promise<void> { /* ... */ }
```

## 规范要点

| 场景 | 做法 |
| - | - |
| 取上下文 | Controller 显式传入，Service 不读 ALS |
| 入参 | interface，>3 参用对象参数 |
| 返回 | 实体聚合，不构造 VO |
| 类型 | 不 as any，ALS 即时断言 |
| 敏感操作 | 独立接口 + 独立方法 |

## 权威源

- skill：[`service-paradigm`](../skills/atomic/service-paradigm)、[`type-safety`](../skills/atomic/type-safety)、[`implement-service`](../skills/composite/implement-service)
- 开发文档：`docs/development/guide-line.md`（<a href="../raw/docs/development/guide-line.md" target="_blank" rel="noopener">原文</a>）
- 相关页：[请求生命周期与上下文](./request-lifecycle)、[序列化与 VO](./serialization-vo)
