# Eli FDE 客户协作工作台

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

客户填写企业需求；工作人员整理原文、访谈问题、范围、报价草案、变更和验收记录。依据：当前用户需求与既有 PRD。

## Product Purpose

从需求问卷衔接到可核对的交付资料。客户以选择题为主，每步最多五题；详细模式按客户类型、规模、行业与需求组合问题。

## Operating Context

本机 127.0.0.1 演示，当前仅使用注册的虚构客户数据根。用户明确要求直接打开工作台，无账号密码页面。

## Capabilities and Constraints

保留客户原文版本、内部编辑草稿、不可变快照、修订冲突处理、对客授权撤销、独立资料包、备份恢复。免密码入口仅在当前本机合成演示根启用；其他数据根的认证不变。不接入真实客户库，不部署公网，不添加依赖或外部 AI 调用。

## Brand Commitments

Eli FDE。简体中文；用户要求动效、UI、UX、排版与布局重塑，去除 AI 模板感。已确认首页句子：把 AI 变成企业的生产力。

## Evidence on Hand

docs/EXECUTION_PRD-client-delivery-20261012.md 与 evidence/delivery-rev2/ 为既有功能依据；本次界面修改必须补充当前浏览器验证。

## Product Principles

- 操作名称明确，主要任务容易找到。
- 未保存内容切换页签仍保留，反馈可见。
- 内部资料与对客资料的边界清楚。
- 示例不冒充真实客户成果。

## Open Decisions

用户已选择「简洁专业」：浅灰底、白色工作区、深色侧栏，信息紧凑，动效用于切换和反馈。工作流构建偏好未指定，不记录永久默认。
