# cns-openwrt

[CNS](https://github.com/mmmdbybyd/CNS) 的 OpenWrt 插件，带 LuCI 界面。
24.10 及更早用 ipk，25.12 及更新用 apk。

## 编进固件

```sh
cd openwrt
git clone https://github.com/CoverUp137/cns-openwrt package/cns
make menuconfig
```

在 `Network → Web Servers/Proxies → cns` 和 `LuCI → Applications → luci-app-cns` 里选中，
然后 `make -j$(nproc)`。架构跟着你的 target 自动走，不用指定。

需要 feeds/packages（里面有 golang），默认的 `feeds.conf.default` 已经带了。
也可以用 feed 方式：`src-git cns https://github.com/CoverUp137/cns-openwrt.git`。

## 拿编好的包

Actions 每次推送都会编全架构的 ipk 和 apk，产物在 Actions 的 Artifacts 里；
打 `v*` 标签才会发 Release。

## 安装

ipk：

```sh
opkg install cns_<版本>_<架构>.ipk luci-app-cns_<版本>_all.ipk
```

apk：

```sh
apk add --allow-untrusted cns-<版本>-<架构>.apk luci-app-cns-<版本>-noarch.apk
```

装完在 LuCI 的「服务」里。
