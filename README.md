# Venera community URL

一个可直接填入 Venera `Repo URL` 的个人社区漫画源仓库。目前收录腾讯动漫与 NoyManga，也可接收“新源工坊”生成并通过复检的新源。

## 仓库导入地址

复制下面这一个地址：

```text
https://raw.githubusercontent.com/casthan321/Venera-community-URL/main/index.json
```

备用 jsDelivr 地址：

```text
https://cdn.jsdelivr.net/gh/casthan321/Venera-community-URL@main/index.json
```

在 Venera 中依次打开：

1. `设置 → 漫画源`；
2. 将上述地址粘贴到 `Repo URL`；
3. 点击 `Refresh`；
4. 在需要的源旁点击 `Add`。

> `Repo URL` 是 Venera 的全局社区列表地址。使用本仓库会替换当前列表地址；若要恢复官方列表，请换回：
> `https://cdn.jsdelivr.net/gh/venera-app/venera-configs@main/index.json`

也可在[新源工坊](https://venera-source-forge.casterh35.chatgpt.site/#community)中一键复制仓库导入地址。

## 网页一键发布

“新源工坊”生成漫画源后默认不会提交。用户可以自行选择只下载到本地，或准备发布到本仓库；选择 GitHub 后，网页会先显示源名称、文件、Key 与版本，只有再次点击“确认提交到 GitHub”才会发起发布。服务端也会强制检查这一确认标记，随后重新检查元数据、搜索、详情、章节图片、已声明的可选能力和敏感信息，再用一次原子提交同时更新源文件和对应的 `index.json` 条目。提交成功后，GitHub Actions 会继续用官方 `venera_cli` 做最终验证。

账号密码、Cookie、访问令牌和完整请求头都不应进入源文件，也不会作为发布内容提交。若服务端复检、版本检查或 GitHub 并发检查失败，仓库不会被强制覆盖。

## 已收录源

| 漫画源 | 版本 | 已声明能力与范围 | 单源安装 URL |
| --- | --- | --- | --- |
| 腾讯动漫 | 1.1.2 | 首页分区、QQ 网页登录、可读分类标题、真实尾页、账号状态与云收藏；仅读取服务器已授权的网页章节 | [复制地址](https://raw.githubusercontent.com/casthan321/Venera-community-URL/main/tencent_comics.js) |
| NoyManga | 1.1.2 | 首页分区、Cookie 网页登录、可读分类标题、账号状态、云收藏、手动签到与默认关闭的自动签到；无需 LocalStorage 令牌 | [复制地址](https://raw.githubusercontent.com/casthan321/Venera-community-URL/main/noymanga.js) |

导入后请进入源设置，点击“登录”（会打开源内网页），在目标站正常完成登录；需要排查连接时再点“连接测试”里的“测试”。账号、密码只提交给目标站，仓库和创建器不会接收。

> 1.1.2 把旧的分类式“发现”换成真正的首页分区。已有安装更新后若仍显示旧页签，请进入 `设置 → 发现 → 探索页面`，勾选 `腾讯动漫 · 首页` / `NoyManga · 首页`，并在网络收藏页面勾选对应源。最省事的办法是删除旧源后从本仓库重新添加一次；Venera 1.6.x 更新源时不会自动登记后来新增或改名的页面。

## 源能力因站点而异

仓库中的每个源都必须具备搜索、漫画详情和章节图片读取能力。登录、收藏、发现、分类与签到属于可选能力：只有站点确实支持且源文件明确声明时，Venera 才会显示相应入口，仓库检查也只验证已经声明的可选能力，不能把缺少可选功能误判为整个源不可用。

腾讯动漫与 NoyManga 1.1.2 继续按完整能力清单严格检查，不能静默丢失登录、收藏或首页分区；NoyManga 还必须保留手动签到和默认可控的自动签到设置。其他一键发布的新源即使只有基础阅读能力，也可以通过基础检查，但不会因此凭空获得登录、收藏、首页分区或签到功能。

## 账号能力边界

- 腾讯动漫没有已验证的网页签到接口，因此本源不提供签到；收藏操作使用官网接口并在写入后回读确认。
- 腾讯章节严格服从官网返回的 `canRead` 与 APP 专属标记。即使已经登录，也不会调用购买接口或绕过未授权章节。
- NoyManga 自动签到默认关闭；开启后只在普通读取操作中每日机会式尝试一次。`连接测试`只读签到状态，不会签到或修改收藏。
- 登录过期时重新点击源内“登录”即可，不需要寻找 Cookie 字段或 LocalStorage 令牌键。

## 验证

每次推送都会自动检查：

- `index.json` 结构、文件名、Key 与版本一致性；
- 源文件首行、更新 URL、最低 Venera 版本、搜索、详情、章节图片与敏感信息；
- 源文件实际声明的账号、收藏、发现和签到结构；
- 通用源无可选能力、发现页分类/搜索跳转和敏感信息拒绝规则的固定测试；
- 腾讯动漫与 NoyManga 的既有完整能力，以及官方 `venera_cli source validate` 兼容性。

## 使用边界

- 本项目不是 Venera 官方仓库，也不托管任何漫画内容。
- 仅用于用户有权访问的网页内容，不绕过付费、验证码、DRM 或访问控制。
- 提交 Issue 时不要粘贴密码、Cookie、令牌或完整请求头。
