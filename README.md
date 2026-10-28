# cns-openwrt

[CNS](https://github.com/mmmdbybyd/CNS) 的 OpenWrt 插件，带 LuCI 界面。
24.10 及更早用 ipk，25.12 及更新用 apk。

## 编译

```sh
git clone https://github.com/CoverUp137/cns-openwrt
cd cns-openwrt
sh scripts/build.sh
```

包输出到 `dist/`。默认编 x86_64、aarch64、armv7、mipsel，只要一个架构：

```sh
ARCHS="<你的架构>" sh scripts/build.sh
```

需要 go 和 docker（docker 只用来生成 apk，没有就只出 ipk）。
不想本地编的话，在 Actions 里手动跑一次，产物在 Artifacts 里。

## 编进固件

把 `package/cns`、`package/luci-app-cns` 放进 OpenWrt 源码的 `package/` 下，
menuconfig 里选中后一起编译。

## 安装

ipk：

```sh
opkg install cns_<版本>_<架构>.ipk luci-app-cns_<版本>_all.ipk
```

apk：

```sh
apk add --allow-untrusted cns-<版本>-<架构>.apk luci-app-cns-<版本>-noarch.apk
```

装完在 LuCI 的「服务」里就能看到。
