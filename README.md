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
| 腾讯动漫 | 1.0.1 | 网页公开可读内容；主动拒绝付费及 APP 专属章节 | [复制地址](https://raw.githubusercontent.com/casthan321/Venera-community-URL/main/tencent_comics.js) |
| NoyManga | 1.0.1 | 在源设置中完成网页登录；Cookie 自动接管，无需 LocalStorage 令牌 | [复制地址](https://raw.githubusercontent.com/casthan321/Venera-community-URL/main/noymanga.js) |

NoyManga 导入后请进入源设置，点击“网页登录”，正常登录后运行 `Level 3 自检`。

## 验证

每次推送都会自动检查：

- `index.json` 结构、文件名、Key 与版本一致性；
- 源文件首行、更新 URL 与最低 Venera 版本；
- 官方 `venera_cli source validate` 兼容性。

## 使用边界

- 本项目不是 Venera 官方仓库，也不托管任何漫画内容。
- 仅用于用户有权访问的网页内容，不绕过付费、验证码、DRM 或访问控制。
- 提交 Issue 时不要粘贴密码、Cookie、令牌或完整请求头。
