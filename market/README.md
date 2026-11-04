# 插件索引 / Plugin index

`index.json` 是一份符合 DSH「插件市场索引格式 1」的索引，收录本插件，已经用 DSH 自带校验器
(`@deepseek-ai/dsh-plugin-market-index` 的 `parseMarketIndex`) 验证通过。

本插件只走 Git 分发，不发布到 npm：

- 仓库：<https://github.com/CWB-CHI/dsh-reboot-button>
- 固定版本：`git+https://github.com/CWB-CHI/dsh-reboot-button.git#<commit>`

## 先说结论

DSH 目前**没有官方市场**：插件市场的 Discover 页只读取用户自己添加的索引地址
（`@deepseek-ai/dsh-experimental-plugin-market-bundle` 的 README 原文：*There is no official market; Discover lists only the index sources the user adds.*）。

所以「被收录」只有两条路：

1. **自己发布索引**——托管 `index.json`，别人把它加进 Discover 就能看到并安装。
2. **进别人的索引**——给维护索引的人提 PR，把自己的条目加进他们的 `index.json`。

## 当前条目

```json
{
  "name": "@local/dsh-reboot-button",
  "versions": [
    {
      "version": "1.0.0",
      "publishTimestamp": 1793781502,
      "source": {
        "type": "git",
        "url": "https://github.com/CWB-CHI/dsh-reboot-button.git",
        "commit": "d06482e05c73cc65d25d204a0ceac50216a31709"
      }
    }
  ]
}
```

市场把这一条翻译成安装参数 `git+https://github.com/CWB-CHI/dsh-reboot-button.git#d06482e…`，
再由 `plugin_manager` 交给 pnpm 拉取。包在仓库根目录，所以不需要 `path`；包不在根目录时
`"path": "sub/dir"`（不能出现 `.`、`..` 段）。

## 发新版本

Git 源锁的是**提交 SHA**，不是分支，所以每次发版要三步：

1. 改 `package.json` 的 `version`，提交并推送；
2. 把新提交的 40 位 SHA 和提交时间（Unix 秒，`git log -1 --format=%ct`）写进 `market/index.json`；
3. 提交索引。

分支移动不会影响已收录的版本——这正是固定 SHA 的意义；但也意味着忘了第 2 步，市场里永远是旧版本。

## 托管与添加

- 索引必须是可直接 GET 的 JSON，**不能重定向**；支持 `http:` 和 `https:`，不能带账号密码、查询串或片段；
- 最简单的托管：把 `market/` 目录放到 GitHub Pages（仓库 Settings → Pages → 选分支目录），
  地址形如 `https://cwb-chi.github.io/dsh-reboot-button/index.json`；
  GitHub Pages 的默认域名就是你仓库名的子路径，和 `market/index.json` 一起提交即可；
- 图标三种写法：`https:` 绝对地址、与索引**同源**的相对路径、或 ≤32 KiB 的 `data:` URL
  （本文件用的是内联 SVG，省掉单独托管图标）；
- 本地试跑：

  ```pwsh
  npx --yes serve market
  # DSH：设置 → 插件市场 → 「实验性插件」旁的更多菜单 → 打开「自定义插件市场」
  # → Discover → 添加索引源 → http://127.0.0.1:3000/index.json
  ```

## 格式要点（校验规则）

| 字段 | 要求 |
|---|---|
| `format` | 必须是 `1` |
| `title` / `description` | 字符串或本地化对象；对象形式**必须含 `en`**，其他键是小写语言 id |
| `plugins[].name` | 合法 npm 包名，重复即报错 |
| `plugins[].versions[]` | 非空数组，`version` 是精确 SemVer，`publishTimestamp` 是 **Unix 秒**整数 |
| `versions[].source` | `{type:'npm', registry?}` 或 `{type:'git', url, commit, path?}`；`commit` 是 40 位小写 SHA |
| `metadata.category` / `labels` / `sortKeys` | 只能引用 `metadata` 里声明过的 id |

校验器只检查格式，不检查这些字段是否真的对应到包（*generator obligations are unchecked*），
索引内容也不签名——最终装什么以包自己的 manifest 为准，安装仍需用户确认。
