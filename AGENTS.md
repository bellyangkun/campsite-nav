# AGENTS.md — campsite-nav 项目记忆

## 后端字段的 URL 形态 (容易踩坑)
后端 `checkins.json` 里 `shotUrl` 字段是**完整路径**: `/ar_shots/shot_xxx.jpg`
(带前导 `/`, 不带 host)。

前台 `const API = '/api'` 是 API base, **不能无条件拼到 shotUrl 前面**:
- 错: `<img src="${API}${c.shotUrl}">` → `/api/ar_shots/...` → nginx 404 (前缀不匹配反代)
- 对: `<img src="${c.shotUrl.startsWith('/ar_shots/') ? c.shotUrl : API + c.shotUrl}">`

适用所有后端返回的"已含完整路径"的字段 (shotUrl / frameUrl / qrcodeUrl 等)。

## Nginx 反代 (重要)
- `/api/...` → 端口 3005 后端
- `/ar_shots/...` → 端口 3005 后端 (静态图)
- `/uploads/...` → 端口 3005 后端 (admin 上传图)
- regex `~* ^/(js|css|assets)/.+\.(...)` 已缩窄, 不会抢反代

调试时用 `curl -GET` (不要用 `-I` HEAD), Node.js 默认不响应 HEAD, 会误判 404。

## 部署
- 腾讯云 lurecamp1.xiabebe.cn (测试/开发): `ubuntu@124.222.29.46` pwd `hErewego~071381`, 前端 `/var/www/lurecamp1.xiabebe.cn/`, 后端 `/home/ubuntu/campsite-nav-api/`
- 阿里云 lurecamp.xiabebe.cn (生产): `root@47.96.168.224` pwd `Babamama408317`, 前端 `/var/www/lurecamp.xiabebe.cn/`, 后端 `/home/campsite-nav-api/`
- 部署后单独 `md5sum` 验证本机 vs 服务器
- 后端起进程不要在 ssh 命令里直接 `nohup ... & disown` (会挂住 ssh), 写脚本 scp + ssh bash 远程执行
- 后端 `EADDRINUSE` 重启要 root 强杀 (`sudo kill -9 <pid>`)
