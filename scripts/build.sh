#!/bin/sh
# 交叉编译 CNS，打成 ipk(24.10 及更早) / apk(25.12 及更新)
set -eu

ROOT=$(cd "$(dirname "$0")/.." && pwd)
VERSION=${VERSION:-0.4.3}
RELEASE=${RELEASE:-3}
MAINTAINER=${MAINTAINER:-"CoverUp137 <CoverUp137@users.noreply.github.com>"}
CNS_REPO=${CNS_REPO:-https://github.com/mmmdbybyd/CNS.git}
CNS_COMMIT=${CNS_COMMIT:-5077eacdc2de49104fe2564b0607e06ba621102c}

OUT=$ROOT/dist
BIN=$ROOT/build/bin
STAGE=$ROOT/build/stage
SRC=$ROOT/src/cns
VER=$VERSION-$RELEASE
APKVER=$VERSION-r$RELEASE

: "${ARCHS:=x86_64 aarch64_cortex-a53 arm_cortex-a7_neon-vfpv4 mipsel_24kc}"

# go：优先用仓库自带的，没有就用系统里的
if [ -x "$ROOT/tools/go/bin/go" ]; then
	PATH="$ROOT/tools/go/bin:$PATH"
	export PATH
fi
command -v go >/dev/null 2>&1 || { echo "找不到 go，请装 go 或放到 tools/go" >&2; exit 1; }

export CGO_ENABLED=0
export HOME=${HOME:-/root}
export GOCACHE=${GOCACHE:-$ROOT/build/.gocache}
export GOPATH=${GOPATH:-$ROOT/build/.gopath}

# 上游源码：没有就拉固定 commit
if [ ! -f "$SRC/go.mod" ]; then
	echo ">>> 获取上游源码 $CNS_COMMIT"
	rm -rf "$SRC"
	git clone -q "$CNS_REPO" "$SRC"
	git -C "$SRC" checkout -q "$CNS_COMMIT"
fi

goarch_of() {
	case "$1" in
		x86_64)      echo "GOARCH=amd64" ;;
		i386*)       echo "GOARCH=386" ;;
		aarch64*)    echo "GOARCH=arm64" ;;
		arm_*)       echo "GOARCH=arm GOARM=7" ;;
		mipsel*)     echo "GOARCH=mipsle GOMIPS=softfloat" ;;
		mips*)       echo "GOARCH=mips GOMIPS=softfloat" ;;
		*)           echo "GOARCH=amd64" ;;
	esac
}

build_bin() {
	arch=$1 out=$2
	[ -x "$out" ] && return 0
	echo ">>> 编译 $arch"
	# shellcheck disable=SC2086
	env $(goarch_of "$arch") GOOS=linux \
		go build -C "$SRC" -trimpath -ldflags="-s -w" -o "$out" .
}

stage_cns() {
	d=$1 arch=$2
	rm -rf "$d"; mkdir -p "$d"
	install -Dm755 "$BIN/cns-$arch" "$d/usr/bin/cns"
	install -Dm755 "$ROOT/cns/files/cns.init" "$d/etc/init.d/cns"
	install -Dm644 "$ROOT/cns/files/cns.config" "$d/etc/config/cns"
}

stage_luci() {
	d=$1
	rm -rf "$d"; mkdir -p "$d"
	install -Dm644 "$ROOT/luci-app-cns/htdocs/luci-static/resources/view/cns/cns.js" \
		"$d/www/luci-static/resources/view/cns/cns.js"
	install -Dm644 "$ROOT/luci-app-cns/root/usr/share/luci/menu.d/luci-app-cns.json" \
		"$d/usr/share/luci/menu.d/luci-app-cns.json"
	install -Dm644 "$ROOT/luci-app-cns/root/usr/share/rpcd/acl.d/luci-app-cns.json" \
		"$d/usr/share/rpcd/acl.d/luci-app-cns.json"
}

# OpenWrt 的 ipk 是 tar.gz(debian-binary, data.tar.gz, control.tar.gz)，不是 Debian 的 ar
mk_ipk() {
	staged=$1 name=$2 arch=$3 depends=$4 desc=$5 scripts=$6 out=$7
	t=$ROOT/build/ipk-$name-$arch
	rm -rf "$t"; mkdir -p "$t/control" "$t/out"
	{
		echo "Package: $name"
		echo "Version: $VER"
		echo "Depends: $depends"
		echo "Source: $CNS_REPO"
		echo "SourceName: ${name%-openwrt}"
		echo "Section: net"
		echo "Priority: optional"
		echo "Maintainer: $MAINTAINER"
		echo "Architecture: $arch"
		echo "Description: $desc"
	} > "$t/control/control"
	[ "$name" = cns ] && printf '/etc/config/cns\n' > "$t/control/conffiles"
	if [ -n "$scripts" ] && [ -d "$scripts" ]; then
		for f in "$scripts"/*; do
			[ -f "$f" ] || continue
			cp "$f" "$t/control/$(basename "$f")"
			chmod 755 "$t/control/$(basename "$f")"
		done
	fi
	( cd "$staged" && tar --format=gnu --numeric-owner --sort=name -czf "$t/out/data.tar.gz" ./ )
	echo "Installed-Size: $(gzip -dc "$t/out/data.tar.gz" | wc -c)" >> "$t/control/control"
	( cd "$t/control" && tar --format=gnu --numeric-owner --sort=name -czf "$t/out/control.tar.gz" ./ )
	printf '2.0\n' > "$t/out/debian-binary"
	( cd "$t/out" && tar --format=gnu --numeric-owner --sort=name -czf "$out" ./debian-binary ./data.tar.gz ./control.tar.gz )
	echo ">>> $(basename "$out")"
}

# apk-tools 3 才有 mkpkg，借 alpine:edge 里的
mk_apk() {
	staged=$1 name=$2 arch=$3 desc=$4 depends=$5 scripts=$6 out=$7
	if ! command -v docker >/dev/null 2>&1; then
		echo ">>> 跳过 apk（没有 docker）"
		return 0
	fi
	rel_stage=$(realpath --relative-to "$ROOT" "$staged")
	rel_out=$(realpath --relative-to "$ROOT" "$out")
	dep_opt=""
	[ -n "$depends" ] && dep_opt="-I depends:$depends"
	script_opt=""
	if [ -n "$scripts" ] && [ -d "$scripts" ]; then
		for f in "$scripts"/*; do
			[ -f "$f" ] || continue
			case "$(basename "$f")" in
				preinst)  typ=pre-install ;;
				postinst) typ=post-install ;;
				prerm)    typ=pre-deinstall ;;
				postrm)   typ=post-deinstall ;;
				*) continue ;;
			esac
			script_opt="$script_opt -s $typ:/w/$(realpath --relative-to "$ROOT" "$f")"
		done
	fi
	# shellcheck disable=SC2086
	docker run --rm -v "$ROOT:/w" -w /w alpine:edge ash -c "
apk mkpkg -F /w/$rel_stage \
  -I name:$name -I version:$APKVER -I arch:$arch \
  -I description:'$desc' -I url:https://github.com/mmmdbybyd/CNS \
  -I license:GPL-2.0 -I origin:$name -I maintainer:'$MAINTAINER' \
  $dep_opt $script_opt \
  --compat 3.0 -o /w/$rel_out" >/dev/null
	echo ">>> $(basename "$out")"
}

mkdir -p "$OUT" "$BIN" "$ROOT/build/scripts/cns" "$ROOT/build/scripts/luci-app-cns"

cat > "$ROOT/build/scripts/cns/postinst" <<'EOF'
#!/bin/sh
[ -n "${IPKG_INSTROOT}" ] || {
	/etc/init.d/cns enable
	/etc/init.d/cns restart
}
exit 0
EOF

cat > "$ROOT/build/scripts/cns/prerm" <<'EOF'
#!/bin/sh
[ -n "${IPKG_INSTROOT}" ] || {
	/etc/init.d/cns stop
	/etc/init.d/cns disable
}
exit 0
EOF

# 装完/卸完立刻让 LuCI 菜单和 ACL 生效，不用重启（和 luci.mk 默认行为一致）
for f in postinst prerm; do
	cat > "$ROOT/build/scripts/luci-app-cns/$f" <<'EOF'
#!/bin/sh
[ -n "${IPKG_INSTROOT}" ] || {
	rm -f /tmp/luci-indexcache.*
	rm -rf /tmp/luci-modulecache/
	/etc/init.d/rpcd reload 2>/dev/null
}
exit 0
EOF
done
chmod 755 "$ROOT/build/scripts/cns"/* "$ROOT/build/scripts/luci-app-cns"/*

for arch in $ARCHS; do
	build_bin "$arch" "$BIN/cns-$arch"
	stage_cns "$STAGE/cns-$arch" "$arch"
	mk_ipk "$STAGE/cns-$arch" cns "$arch" jshn \
		"CuteBi Network Server: TCP/UDP tunnel proxy and HTTP DNS server" \
		"$ROOT/build/scripts/cns" "$OUT/cns_${VER}_${arch}.ipk"
	mk_apk "$STAGE/cns-$arch" cns "$arch" \
		"CuteBi Network Server: TCP/UDP tunnel proxy and HTTP DNS server" \
		jshn "$ROOT/build/scripts/cns" "$OUT/cns-${VER}-${arch}.apk"
done

stage_luci "$STAGE/luci-app-cns"
mk_ipk "$STAGE/luci-app-cns" luci-app-cns all "luci-base, cns" \
	"LuCI web interface for CNS" "$ROOT/build/scripts/luci-app-cns" "$OUT/luci-app-cns_${VER}_all.ipk"
mk_apk "$STAGE/luci-app-cns" luci-app-cns noarch \
	"LuCI web interface for CNS" "luci-base cns" "" "$OUT/luci-app-cns-${VER}-noarch.apk"

( cd "$OUT" && rm -f MD5SUMS && md5sum ./*.ipk ./*.apk > MD5SUMS )

echo
echo "== $OUT =="
ls -1 "$OUT"
