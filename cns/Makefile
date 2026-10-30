include $(TOPDIR)/rules.mk

PKG_NAME:=cns
PKG_VERSION:=0.4.3
PKG_RELEASE:=11

PKG_SOURCE_PROTO:=git
PKG_SOURCE_URL:=https://github.com/mmmdbybyd/CNS.git
PKG_SOURCE_VERSION:=5077eacdc2de49104fe2564b0607e06ba621102c
PKG_MIRROR_HASH:=skip

PKG_LICENSE:=GPL-2.0
PKG_LICENSE_FILES:=Changes
PKG_MAINTAINER:=CoverUp137 <CoverUp137@users.noreply.github.com>

PKG_BUILD_DEPENDS:=golang/host
PKG_BUILD_PARALLEL:=1

GO_PKG:=cns

include $(INCLUDE_DIR)/package.mk

# golang-package.mk 在树里的位置随版本不同，按顺序找第一个存在的
GO_PKG_MK:=$(firstword $(wildcard \
	$(TOPDIR)/package/lang/golang/golang-package.mk \
	$(TOPDIR)/feeds/packages/lang/golang/golang-package.mk \
	$(TOPDIR)/feeds/golang/golang-package.mk))
ifeq ($(GO_PKG_MK),)
$(error 找不到 golang-package.mk，请确认 feeds/packages 已安装)
endif
include $(GO_PKG_MK)

define Package/cns
  SECTION:=net
  CATEGORY:=Network
  SUBMENU:=Web Servers/Proxies
  TITLE:=CuteBi Network Server
  URL:=https://github.com/mmmdbybyd/CNS
  DEPENDS:=$(GO_ARCH_DEPENDS) +jshn
endef

define Package/cns/description
CNS 是一个 Go 写的 HTTP/TLS 隧道代理 + HTTP DNS 服务端，配合 CLNC 客户端使用。
endef

define Package/cns/conffiles
/etc/config/cns
endef

define Package/cns/install
	$(call GoPackage/Package/Install/Bin,$(1))
	$(INSTALL_DIR) $(1)/etc/init.d $(1)/etc/config
	$(INSTALL_BIN) ./files/cns.init $(1)/etc/init.d/cns
	$(INSTALL_CONF) ./files/cns.config $(1)/etc/config/cns
endef

define Package/cns/postinst
#!/bin/sh
# 装完不自动启动，也不设开机自启；在 LuCI 里点启动才会 enable
[ -n "$${IPKG_INSTROOT}" ] || {
	/etc/init.d/cns stop 2>/dev/null
	/etc/init.d/cns disable 2>/dev/null
}
exit 0
endef

define Package/cns/prerm
#!/bin/sh
[ -n "$${IPKG_INSTROOT}" ] || {
	/etc/init.d/cns stop
	/etc/init.d/cns disable
}
exit 0
endef

$(eval $(call GoBinPackage,cns))
$(eval $(call BuildPackage,cns))
