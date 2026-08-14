# Venera community URL

一个可直接填入 Venera `Repo URL` 的个人社区漫画源仓库。目前收录腾讯动漫与 NoyManga。

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

## 已收录源

| 漫画源 | 版本 | 登录与范围 | 单源安装 URL |
| --- | --- | --- | --- |
| 腾讯动漫 | 1.1.0 | 独立发现页、QQ 网页登录、账号状态与云收藏；仅读取服务器已授权的网页章节，不提供签到、购买或 APP 专属内容 | [复制地址](https://raw.githubusercontent.com/casthan321/Venera-community-URL/main/tencent_comics.js) |
| NoyManga | 1.1.0 | 独立发现页、Cookie 网页登录、账号状态、云收藏、手动签到与默认关闭的自动签到；无需 LocalStorage 令牌 | [复制地址](https://raw.githubusercontent.com/casthan321/Venera-community-URL/main/noymanga.js) |

导入后请进入源设置，点击“登录”（会打开源内网页），在目标站正常完成登录，再点击“账号状态”和 `Level 3 自检`。账号、密码只提交给目标站，仓库和创建器不会接收。

> 从 1.0.1 更新到 1.1.0 的已有安装，需要进入 `设置 → 发现 → 探索页面`，勾选 `腾讯动漫-tencent_comics-发现` / `NoyManga-noymanga-发现`；并在 `设置 → 发现 → 网络收藏页面` 勾选腾讯动漫 / NoyManga。最省事的办法是删除旧源后从本仓库重新添加一次，新安装会自动登记这些页面。Venera 1.6.x 更新源时不会自动登记后来新增的页面。

## 账号能力边界

- 腾讯动漫没有已验证的网页签到接口，因此本源不提供签到；收藏操作使用官网接口并在写入后回读确认。
- 腾讯章节严格服从官网返回的 `canRead` 与 APP 专属标记。即使已经登录，也不会调用购买接口或绕过未授权章节。
- NoyManga 自动签到默认关闭；开启后只在普通读取操作中每日机会式尝试一次。`Level 3 自检`只读签到状态，不会签到或修改收藏。
- 登录过期时重新点击源内“登录”即可，不需要寻找 Cookie 字段或 LocalStorage 令牌键。

## 验证

每次推送都会自动检查：

- `index.json` 结构、文件名、Key 与版本一致性；
- 源文件首行、更新 URL、最低 Venera 版本、账号与发现页结构；
- 官方 `venera_cli source validate` 兼容性。

## 使用边界

- 本项目不是 Venera 官方仓库，也不托管任何漫画内容。
- 仅用于用户有权访问的网页内容，不绕过付费、验证码、DRM 或访问控制。
- 提交 Issue 时不要粘贴密码、Cookie、令牌或完整请求头。
