include $(TOPDIR)/rules.mk

PKG_NAME:=luci-app-cns
PKG_VERSION:=0.4.3
PKG_RELEASE:=10

PKG_LICENSE:=GPL-2.0
PKG_MAINTAINER:=CoverUp137 <CoverUp137@users.noreply.github.com>

LUCI_TITLE:=LuCI support for CNS
LUCI_DESCRIPTION:=Web interface for the CNS tunnel proxy server
LUCI_DEPENDS:=+luci-base +cns
LUCI_PKGARCH:=all

# 装完/卸完立刻让 LuCI 菜单和 ACL 生效，不用重启
define Package/luci-app-cns/postinst
#!/bin/sh
[ -n "$${IPKG_INSTROOT}" ] || {
	rm -f /tmp/luci-indexcache.*
	rm -rf /tmp/luci-modulecache/
	/etc/init.d/rpcd reload 2>/dev/null
}
exit 0
endef

define Package/luci-app-cns/prerm
#!/bin/sh
[ -n "$${IPKG_INSTROOT}" ] || {
	rm -f /tmp/luci-indexcache.*
	rm -rf /tmp/luci-modulecache/
	/etc/init.d/rpcd reload 2>/dev/null
}
exit 0
endef

include $(TOPDIR)/feeds/luci/luci.mk
