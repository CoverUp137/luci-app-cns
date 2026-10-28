# CNS 的 OpenWrt 包

把 [mmmdbybyd/CNS](https://github.com/mmmdbybyd/CNS) 0.4.3 打包成 OpenWrt 软件包，带 LuCI 界面。
同一个源码出两种格式：

| 系统 | 包格式 | 管理器 |
| --- | --- | --- |
| 24.10 及更早 | `.ipk` | opkg |
| 25.12 及更新 | `.apk`（apk-tools 3） | apk |

## 安装

24.10：

```sh
opkg install cns_0.4.3-1_aarch64_cortex-a53.ipk luci-app-cns_0.4.3-1_all.ipk
```

25.12：

```sh
apk add --allow-untrusted cns-0.4.3-1-aarch64_cortex-a53.apk luci-app-cns-0.4.3-1-noarch.apk
```

装完在 **服务 → CNS 代理**，默认监听 `:2222`、明文、目标地址字段 `Host`，HTTP DNS 和 TCP DNS 转 UDP 都是开着的。
架构不同就换成对应的文件名（`arm_cortex-a7_neon-vfpv4`、`mipsel_24kc`、`x86_64`），界面包不分架构。

## 结构

```
package/cns/                    cns 包（二进制 + /etc/init.d/cns + /etc/config/cns）
package/luci-app-cns/           LuCI 界面
scripts/build.sh                交叉编译 + 打 ipk/apk
dist/                           成品包和 MD5SUMS
src/cns/                        上游源码
```

配置放在 `/etc/config/cns`（UCI），启动时由 init 脚本用 jshn 生成 `/var/etc/cns.json` 给 cns 用。
所以改配置既可以走 LuCI，也可以 `uci set cns.main.proxy_key=xxx` 再 `/etc/init.d/cns restart`。

## 自己重新打包

```sh
ARCHS="aarch64_cortex-a53" sh scripts/build.sh   # 只编一个架构
sh scripts/build.sh                              # 默认 x86_64 / aarch64 / armv7 / mipsel
```

需要 go 和 docker（docker 只是借 alpine:edge 里的 `apk mkpkg` 生成 25.12 的包，没有就只出 ipk）。
上游源码会在第一次构建时自动 clone 到 `src/cns`。

## GitHub Actions

推代码或手动触发 `build` 就会跑一遍，产物在 Actions 的 Artifacts 里；
打 `v*` 标签（比如 `v0.4.3-1`）会自动发 Release 并把包挂上去。

## 进自己的固件

把 `package/cns` 和 `package/luci-app-cns` 一起放进 OpenWrt/immortalwrt 源码的 `package/` 下，
`make menuconfig` 里 Network → Web Servers/Proxies → cns，LuCI → Applications → luci-app-cns。

## 两个坑

- 开了 TLS 监听后，普通端口在 CONNECT 之后**还会再套一层 TLS**（CLNC 的协议），这时用普通 HTTP 代理客户端连不通，是正常的。
- `TCP FastOpen` 需要 root 权限，procd 下就是 root，但部分线路（比如免流）开了反而更慢。
