---
layout: home

hero:
  name: qyy-code-lego NestJS
  text: 后端开发规范
  tagline: 面向人类与 AI Agent 的双阅读模式文档站
  actions:
    - theme: brand
      text: 快速上手
      link: /guide/quickstart
    - theme: alt
      text: 规范
      link: /specs/architecture

features:
  - title: 统一基础设施
    details: 全局 Filter / Pipe / Interceptor / Guard 链，复用 ApiResBody、BizError、ThreadLocal，禁止重复造轮子。
    link: /specs/request-lifecycle
  - title: 严格分层
    details: Service 上下文无关、interface 入参、查询分层；VO 由 vo-transform 装配，展示态不污染 Service。
    link: /specs/service-paradigm
  - title: Skill 库
    details: 37 个 atomic/composite skill，可一键安装到 Claude Code / Copilot / Gemini / Codex / Trae。
    link: /skills/
  - title: Agent 端点
    details: llms.txt + agent/index.json + raw 纯净原文，三步检索，禁止凭训练记忆编造。
    link: /agent/
---
