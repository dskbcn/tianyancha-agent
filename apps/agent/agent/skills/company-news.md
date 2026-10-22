---
description: 'Use for questions about companies settling in 杭州 from 公众号文章 (总部迁入、项目落地、新成立、新设子公司、研发中心): finding articles, counting by type/district/month, reading full text, and joining articles to company records.'
---

# 公众号文章：杭州企业落地动态

## 数据是什么（2026-10-22 实测，数字会增长）

- 表 `wechat_articles`：约 467 篇，**只有一个公众号「湖畔自留田」**，发布日期 2025-02-21 → 2026-10-20。
  回答时说明来源是这一个公众号，不代表全部落地事件。
- 落地类型 `settle_type`：总部迁入 147、项目落地 121、新成立 110、新设子公司 83、研发中心 5、新设团队/业务单元 1。
- 约 384 篇有主体企业 `company_id`，全部能关联到 `tyc_advanced_search_companies.id`。

## 用哪个工具

| 问题                                                         | 工具                                                     |
| ------------------------------------------------------------ | -------------------------------------------------------- |
| "今年各区总部迁入多少家""按月看落地趋势""列出项目落地的文章" | `company_sql` 查 `wechat_articles`（计数、分组、清单）   |
| "有没有机器人企业来杭州设研发中心""农夫山泉相关的落地新闻"   | `article_search`（语义 + 关键词；专有名词放 `keywords`） |
| "这篇讲了什么""这家公司为什么迁过来"                         | `article_read`（正文只能这样读，SQL 读不到正文）         |
| "迁入企业的注册资本/行业/成立时间"                           | `company_sql` 用 `company_id` JOIN 企业表                |

## SQL 可用字段

`wechat_articles` 只允许：`id, title, account_name, publish_date, url, settle_type, district,
origin_city, company_name, company_id, credit_code, llm_reason, read_count, like_count,
share_count, comment_count, created_at, updated_at`。**没有正文**（`content_text` 不在白名单）。

- `publish_date` 是 DATE 类型，可以直接比较、`to_char(publish_date,'YYYY-MM')` 分组。
- 关联企业：`JOIN tyc_advanced_search_companies c ON c.id = a.company_id`（主键关联，很快）。

```sql
SELECT a.settle_type, COUNT(*) AS n,
       COUNT(*) FILTER (WHERE c.registered_capital LIKE '%万人民币'
         AND substring(c.registered_capital from '^[0-9.]+')::numeric >= 10000) AS cap_1yi_plus
FROM wechat_articles a LEFT JOIN tyc_advanced_search_companies c ON c.id = a.company_id
WHERE a.publish_date >= '2026-01-01'
GROUP BY 1 ORDER BY n DESC
```

## 数据坑

- **区县 `district` 不可靠**：71 篇为空；有"未来科技城""杭州市"这类非区县值；还有深圳的"南山区""龙岗区"
  （总部迁入文章有时标的是企业原所在地）。按区县统计时：说明这些情况，必要时改用关联企业的
  `c.district_county`，并把空值单列"未标注"。
- `origin_city`（从哪迁来）大多为空，写法不统一（"北京"/"北京市"）：分组前用 `replace(origin_city,'市','')` 合并。
- `read_count` 上限 100001，表示"10万+"。
- 文章是媒体报道，不是工商登记：落地类型、金额、规模以文章为准时要说"据报道"；能用企业表核实的
  （注册资本、成立日期、登记状态）就去核实，并标出两者不一致的地方。
- 一家企业可能有多篇文章（不同阶段的报道），按企业计数时 `COUNT(DISTINCT company_id)`。

## 回答方式

- 引用文章时给标题、日期，并附链接：`[标题](url)`。
- 不要大段转述原文；概括要点，用户要细节再读全文。
- 做成产物时（时间线、落地地图、类型分布）：先用 `company_sql` 或 `article_search` 得到结果文件，再在 `data` 里引用。
