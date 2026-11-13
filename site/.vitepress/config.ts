import { defineConfig } from 'vitepress';

// base 解析顺序：--base= 参数 > SITE_BASE 环境变量 > 默认 '/'。
// 部署到 GitHub Pages 时 SITE_BASE=/nestjs-stack/（仓库名）。
function resolveBase() {
  const argBase = process.argv.find((a) => a.startsWith('--base='));
  if (argBase) {
    let b = argBase.slice('--base='.length);
    if (!b.startsWith('/')) b = '/' + b;
    if (!b.endsWith('/')) b = b + '/';
    return b;
  }
  const envBase = process.env.SITE_BASE;
  if (envBase) {
    let b = envBase;
    if (!b.startsWith('/')) b = '/' + b;
    if (!b.endsWith('/')) b = b + '/';
    return b;
  }
  return '/';
}

const base = resolveBase();

export default defineConfig({
  lang: 'zh-CN',
  title: 'qyy-code-lego NestJS',
  description: 'qyy-code-lego NestJS Boilerplate 后端开发规范文档站',
  base,
  lastUpdated: true,
  cleanUrls: true,
  // public 下 .md 是给 Agent 抓取的静态原文，不参与页面编译
  srcExclude: ['public/**'],
  ignoreDeadLinks: [/\/raw\//, /llms\.txt/, /index\.json/, /^\/public\//],
  head: [
    ['meta', { name: 'theme-color', content: '#3c8779' }],
  ],
  markdown: {
    lineNumbers: false,
  },
  themeConfig: {
    siteTitle: 'qyy-code-lego NestJS',
    outline: { level: [2, 3], label: '本页导航' },
    docFooter: { prev: '上一页', next: '下一页' },
    lastUpdatedText: '最后更新',
    returnToTopLabel: '回到顶部',
    sidebarMenuLabel: '菜单',
    darkModeSwitchLabel: '主题',
    lightModeSwitchTitle: '切换到浅色模式',
    darkModeSwitchTitle: '切换到深色模式',

    search: {
      provider: 'local',
      options: {
        translations: {
          button: { buttonText: '搜索文档', buttonAriaLabel: '搜索文档' },
          modal: {
            displayDetails: '显示详情',
            resetButtonTitle: '清除查询',
            backButtonTitle: '返回',
            noResultsText: '无法找到相关结果',
            footer: { selectText: '选择', navigateText: '切换', closeText: '关闭' },
          },
        },
      },
    },

    nav: [
      { text: '首页', link: '/' },
      {
        text: '规范',
        items: [
          { text: '架构与请求', link: '/specs/architecture' },
          { text: '接口与数据', link: '/specs/dto-validation' },
          { text: '数据层', link: '/specs/entity-base' },
          { text: '横切能力', link: '/specs/module-organization' },
        ],
      },
      {
        text: '指南',
        items: [
          { text: '快速上手', link: '/guide/quickstart' },
          { text: '新建工程', link: '/guide/create-project' },
          { text: '改造现有工程', link: '/guide/transform-existing' },
          { text: '模块速查', link: '/guide/module-cheatsheet' },
          { text: '安装 Skill', link: '/guide/install-skills' },
        ],
      },
      { text: 'Skill 库', link: '/skills/' },
      { text: 'Agent', link: '/agent/' },
    ],

    sidebar: {
      '/specs/': [
        {
          text: '架构与请求',
          collapsed: false,
          items: [
            { text: '工程结构与 Monorepo', link: '/specs/architecture' },
            { text: '请求生命周期与上下文', link: '/specs/request-lifecycle' },
            { text: '应用启动与 main.ts', link: '/specs/app-bootstrap' },
            { text: '配置体系', link: '/specs/config' },
          ],
        },
        {
          text: '接口与数据',
          collapsed: false,
          items: [
            { text: 'DTO 校验与范围查询', link: '/specs/dto-validation' },
            { text: 'RESTful 风格 ⚠️', link: '/specs/restful-style' },
            { text: '分页 / 列表 / 简单列表 ⚠️', link: '/specs/pagination-list' },
            { text: '统一响应体与异常', link: '/specs/response-error' },
            { text: '序列化与 VO ⚠️', link: '/specs/serialization-vo' },
            { text: '身份、权限与数据范围', link: '/specs/auth-permission' },
          ],
        },
        {
          text: '数据层',
          collapsed: false,
          items: [
            { text: '实体基类与 Mixin', link: '/specs/entity-base' },
            { text: 'TypeORM 查询设计', link: '/specs/sql-query' },
            { text: '缓存与 Redis', link: '/specs/cache-redis' },
            { text: 'Service 层范式与类型安全 ⚠️', link: '/specs/service-paradigm' },
          ],
        },
        {
          text: '横切能力',
          collapsed: false,
          items: [
            { text: '业务模块组织与实现', link: '/specs/module-organization' },
            { text: '文件上传与管理', link: '/specs/file-management' },
            { text: '业务字典', link: '/specs/dict-json' },
            { text: '可观测性（健康/日志/请求日志）', link: '/specs/observability' },
          ],
        },
      ],
      '/guide/': [
        {
          text: '指南',
          items: [
            { text: '快速上手', link: '/guide/quickstart' },
            { text: '新建工程', link: '/guide/create-project' },
            { text: '改造现有工程', link: '/guide/transform-existing' },
            { text: '模块速查', link: '/guide/module-cheatsheet' },
            { text: '安装 Skill', link: '/guide/install-skills' },
          ],
        },
      ],
      '/skills/': [
        {
          text: 'Skill 库',
          items: [
            { text: '总览', link: '/skills/' },
          ],
        },
      ],
      '/agent/': [
        {
          text: 'Agent',
          items: [
            { text: 'Agent 落地说明', link: '/agent/' },
          ],
        },
      ],
    },

    footer: {
      message: '基于 VitePress 构建 · 面向人类与 AI Agent 双阅读模式',
      copyright: 'Copyright © qyy-code-lego',
    },

    socialLinks: [
      { icon: 'github', link: 'https://github.com/qyy-code-lego/nestjs-stack' },
    ],
  },
});
