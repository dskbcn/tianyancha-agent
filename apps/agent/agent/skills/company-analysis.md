---
description: Use before the first company_sql / company_find / company_profile call in a session — field reference, data coverage, and SQL pitfalls for the 企业工商 tables.
---

# 企业库查询要点

## 表 tyc_advanced_search_companies（主键 id，约 562 万行）

| 列 | 说明 |
|---|---|
| company_name | 公司名称 |
| registration_status | 登记状态：存续 414 万、注销 140 万、吊销、正常、在业、责令关闭、撤销… |
| enterprise_size | 微型 / 小型 / 中型 / 大型（另有 NULL 和 '-'） |
| registered_capital | 注册资本，TEXT，如 '500万人民币'；31% 为空 |
| paid_in_capital | 实缴资本，93% 为空，不要拿来分析 |
| established_date / approved_date | 成立 / 核准日期，TEXT，全部是 YYYY-MM-DD |
| city / district_county | 城市（杭州市、深圳市）/ 区县 |
| enterprise_type | 企业类型，含 '个体工商户'；括号有全角半角两种写法 |
| industry_category / industry_major / industry_subcategory | 国标行业门类 / 大类 / 中类；门类 16% 为空 |
| unified_social_credit_code | 统一社会信用代码 |
| insured_person_count | 参保人数，TEXT 整数，69% 为空 |
| registered_address, website, business_scope, former_names, tianyan_score | 地址、网址、经营范围、曾用名、天眼评分 |

表 `tyc_business_scope_embeddings`（company_id = 上表 id）只用于语义检索，不要直接查。

## 覆盖范围

| 城市 | 行数 | 成立日期覆盖 | 最近更新 |
|---|---|---|---|
| 杭州市 | 295 万 | 2017-07-19 → 2026-09-30 | 2026-10-21 |
| 深圳市 | 267 万 | 2020-01 → 2026-05-20 | 2026-06-24 |

- 这不是全量企业名录，而是这段时间内成立的市场主体。"杭州有多少企业"不能回答，"2017 年 7 月以来杭州成立了多少"可以。
- 比较杭州和深圳只用两地都有数据的区间（2020-01 到 2026-05-20）。
- 深圳 2026-06 之后没有数据，登记状态也停在 6 月。

## 口径

- 市场主体 = 全部行；企业 / 公司 = 去掉个体工商户：`enterprise_type IS DISTINCT FROM '个体工商户'`（不要用 `<>`，会丢掉 NULL 行）。默认两个数都给，先说不含个体工商户的。
- 在营 = 存续、在业、正常；退出 = 注销、吊销、撤销、责令关闭。
- 注册资本只统计人民币：`registered_capital LIKE '%万人民币'`，数值 `substring(registered_capital from '^[0-9.]+')::numeric`（单位万元）。说明有多少行没有注册资本。
- 参保人数：`insured_person_count ~ '^[0-9]+$' AND insured_person_count::int > 0`。

## SQL 写法

- 日期直接按字符串比较：`established_date >= '2026-01-01'`。按月分组 `LEFT(established_date,7)`，按年 `LEFT(established_date,4)`，按季 `to_char(established_date::date,'YYYY-"Q"Q')`。不要用 `date_trunc`（时区偏移）。
- 按 `city` 过滤，不要用 `province`。
- 每次全表扫描约 15 秒。把多个数字放进一条 SQL：`COUNT(*) FILTER (WHERE …)`、`GROUP BY`、CTE、窗口函数都可用。
- 不要 `ORDER BY id` 配合过滤条件，会触发语句超时。
- 分组结果里保留 NULL 组，并在回答里说明"未标注"的数量。

示例：杭州 2026 年 8 月各区县新增，含占比

```sql
SELECT district_county, COUNT(*) AS n,
       COUNT(*) FILTER (WHERE enterprise_type IS DISTINCT FROM '个体工商户') AS companies,
       ROUND(100.0 * COUNT(*) / SUM(COUNT(*)) OVER (), 1) AS pct
FROM tyc_advanced_search_companies
WHERE city = '杭州市' AND LEFT(established_date, 7) = '2026-08'
GROUP BY 1 ORDER BY n DESC
```

## 找某类业务的企业

用 `company_find`，不要用 SQL 的 `LIKE` 拼经营范围。

- `description` 写一句具体的业务描述，不要只写一个词。
- `keywords` 展开同义词和工商表述，例如人工智能：人工智能、智能机器人、机器学习、深度学习、大模型、计算机视觉、自然语言处理、语音识别、图像识别。
- 第一次不设 `minScore`，看 `scoreDistribution`，再告诉用户在 0.5 / 0.55 / 0.6 截断各有多少家。
- 结果显示"已达上限"时名单不完整：按分布选一个截断分数（通常 0.55），用 `minScore` 再查一次，让下载的 CSV 是完整名单，并告诉用户用的是哪个分数。
- 时间、地区条件放在 `filters`，如 `{"city":"杭州市","established_date":{"op":"gte","value":"2025-10-22"}}`。
