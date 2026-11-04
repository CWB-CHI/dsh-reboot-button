# 重启按钮 / Restart Button

给 DeepSeek Harness 桌面版在设置页头部加一个重启按钮。

## 功能

- **位置**：设置面板头部，「打开配置文件」左侧，样式与该按钮一致
- **二次确认**：点一次进入「确认重启」，5 秒内再点一次才执行
- **执行效果**：应用窗口关闭，约 2 秒后自动重新打开
- **安全阀**：有会话或后台任务在运行时拒绝执行，提示「有任务运行中」

## 安装

前提：DeepSeek Harness 桌面版（`dsh web` 下按钮显示「仅桌面版」，不会重启）。

### 从 Git 安装

把下面这个安装源交给插件管理器（`plugin_manager` 的 `install_bundle`），它会被当作 pnpm 安装参数：

```
git+https://github.com/CWB-CHI/dsh-reboot-button.git#39ce2f968661bed9b18d9f1ce1e2066ff7393783
```

末尾的 40 位 SHA 锁定了版本，可以换成任意已推送的提交；去掉它则跟随 `main` 最新提交。

### 通过插件市场

仓库自带一份格式 1 的索引 `market/index.json`，把它托管成 URL 后，可以在
「插件市场 → Discover → 添加索引源」里加入，然后一键安装。托管方法与发版流程见
[market/README.md](market/README.md)。

## 使用

打开设置面板，点「重启」→ 再点「确认重启」，窗口关闭并自动重开。当前会话会被中断，
历史记录都在，重开后可以继续。

## 限制

- 仅桌面应用支持自动重启
- 运行中的任务不会被打断：必须先等它结束再重启

## 仓库

<https://github.com/CWB-CHI/dsh-reboot-button>
