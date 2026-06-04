# gitmob-extension

GitMob 浏览器插件 — GitHub 收藏夹跨设备实时同步

与 [GitMob Android App](https://github.com/xiaobaiweinuli/GitMob-Android) 配合使用，通过 [gitmob-sync-worker](https://github.com/xiaobaiweinuli/gitmob-sync-worker) 实现收藏夹实时同步。

## 功能

- 🔖 在 GitHub 仓库页悬浮「★」按钮，一键收藏到指定分组
- 📂 Popup 面板管理分组（新建、重命名、排序、删除）
- 🔄 与 GitMob App 实时双向同步（WebSocket）
- ⚠️ 多设备冲突检测与解决
- 📤 导入/导出 JSON（与 App 格式完全兼容）
- 📋 同步日志查看
- 🌙 深色界面（符合 GitHub 深色主题习惯）

## 支持浏览器

- Chrome / Chromium（MV3）
- Firefox（MV2）
- Microsoft Edge（MV3）

## 开发

```bash
npm install

# Chrome 开发模式（热重载）
npm run dev:chrome

# Firefox 开发模式
npm run dev:firefox

# 生产构建
npm run build:all
```

构建产物在 `dist/chrome/` 和 `dist/firefox/` 目录。

## 登录方式

插件使用 GitHub Personal Access Token（PAT）登录，只需 `read:user` 权限：

1. 访问 [github.com/settings/tokens/new?scopes=read:user](https://github.com/settings/tokens/new?scopes=read:user)
2. 生成 Token 并复制
3. 在插件设置页粘贴 Token
4. （可选）填入自托管的同步服务地址

## 同步服务

默认使用公共同步服务 `https://sync.gitmob.xyz`。
如需自托管，请参考 [gitmob-sync-worker](https://github.com/xiaobaiweinuli/gitmob-sync-worker) 部署说明，部署后在插件设置页填入您的 Worker URL。
