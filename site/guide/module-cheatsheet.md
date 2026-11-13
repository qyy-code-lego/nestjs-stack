# 模块速查

一个标准业务模块的文件清单与职责速查。详细规范见 [业务模块组织与实现](../specs/module-organization)。

## 目录结构

```text
src/<module>/
  dto/
    create-xxx.dto.ts        # 入参 DTO（class-validator 校验）
    update-xxx.dto.ts        # 修改 DTO（不携带 id）
    query-xxx.dto.ts         # 查询 DTO（含 PaginationDTO / ParseRange）
  vo/
    xxx.vo.ts                # VO class（@Exclude/@Expose/@Transform）
  xxx.controller.ts          # 取 ALS + 调 Service + vo-transform + ApiResBody
  xxx.service.ts             # 上下文无关、interface 入参、查询分层
  xxx.vo-transform.ts        # plainToInstance 把 Service DTO 转 VO
  xxx.module.ts
```

## 职责矩阵

| 文件 | 允许 | 禁止 |
| - | - | - |
| controller | `@IdentityRequired`/`@PermissionRequired`、DTO 校验、取 ALS 传 Service、vo-transform、`ApiResBody.of` | `@Param` 路径参数、复杂业务逻辑 |
| service | interface 入参、查询分层、`cacheService.wrap`、抛 `BizError`、`dataScopeEngine.apply` | ThreadLocal/Request/Response、依赖 vo-transform、构造展示态 |
| vo-transform | `plainToInstance` 转 VO、字典翻译装配 | 业务逻辑、查询 |
| dto | class-validator 装饰器、`@ToDate`/`@ParseRange` | 携带 id（修改类） |
| vo | `@Expose`/`@Exclude`/`@Transform`、继承 Entity | 用 interface 当返回类型 |

## 接口签名速查

```typescript
@Get('/page')   findPage(@Query() q): Promise<ApiResBody<IPageData<XxxVo>>>
@Get('/list')   findList(@Query() q): Promise<ApiResBody<IListData<XxxVo>>>
@Get('/simple-list') findSimpleList(): Promise<ApiResBody<{id,name}[]>>
@Post()         create(@Body() dto): Promise<ApiResBody<XxxVo>>
@Patch()        update(@Query('id') id, @Body() dto): Promise<ApiResBody<XxxVo>>   // 返回完整对象
@Delete()       remove(@Query('id') id): Promise<ApiResBody<void>>
```

## 关联规范

| 主题 | 页面 |
| - | - |
| DTO 校验 | [DTO 校验与范围查询](../specs/dto-validation) |
| RESTful | [RESTful 风格](../specs/restful-style) |
| 分页/列表 | [分页 / 列表 / 简单列表](../specs/pagination-list) |
| 响应/异常 | [统一响应体与异常](../specs/response-error) |
| VO | [序列化与 VO](../specs/serialization-vo) |
| Service | [Service 层范式与类型安全](../specs/service-paradigm) |
