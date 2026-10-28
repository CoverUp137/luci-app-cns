'use strict';
'require view';
'require form';
'require fs';
'require rpc';
'require ui';
'require poll';

var ADDR_RE = /^(\[[0-9a-fA-F:]+\]|[0-9a-fA-F.]+)?:[0-9]{1,5}$/;

var callServiceList = rpc.declare({
	object: 'service',
	method: 'list',
	params: [ 'name', 'verbose' ],
	expect: { '': {} }
});

function isRunning(res) {
	var inst = res && res.cns && res.cns.instances;

	if (!inst)
		return false;

	return Object.keys(inst).some(function(k) { return inst[k] && inst[k].running; });
}

function applyStatus(running) {
	var el = document.getElementById('cns-status');

	if (el) {
		el.className = running ? 'label success' : 'label';
		el.textContent = running ? '运行中' : '已停止';
	}

	['start', 'restart', 'stop'].forEach(function(cmd) {
		var btn = document.getElementById('cns-btn-' + cmd);

		if (btn)
			btn.disabled = running ? (cmd === 'start') : (cmd !== 'start');
	});
}

function refreshStatus() {
	if (!document.getElementById('cns-status'))
		return Promise.resolve();

	return callServiceList('cns', true).then(function(res) {
		applyStatus(isRunning(res));
	}).catch(function() {});
}

var LOG = '/var/log/cns.log';
var LOG_MAX = 1048576;
var LOG_LINES = 200;

function fmtSize(n) {
	if (n >= 1048576)
		return (n / 1048576).toFixed(1) + ' MB';
	if (n >= 1024)
		return Math.round(n / 1024) + ' KB';
	return n + ' B';
}

function refreshLog() {
	return fs.read(LOG).catch(function() { return ''; }).then(function(text) {
		var box = document.getElementById('cns-log');

		if (!box)
			return;

		var lines = (text || '').split('\n');

		if (lines.length > LOG_LINES)
			lines = lines.slice(-LOG_LINES);

		box.textContent = text ? lines.join('\n') : '（还没有日志）';
		box.scrollTop = box.scrollHeight;

		var size = document.getElementById('cns-log-size');

		if (size)
			size.textContent = text ? fmtSize(text.length) : '';
	});
}

function clearLog() {
	return fs.write(LOG, '').then(function() {
		ui.addNotification(null, E('p', {}, [ '日志已清空' ]), 'info');
		return refreshLog();
	}).catch(function(err) {
		ui.addNotification(null, E('p', {}, [ '清空失败：' + err.message ]), 'danger');
	});
}

// 超过 1MB 自动清空，和 init 脚本里的检查一致
function autoTrimLog() {
	return fs.read(LOG).catch(function() { return ''; }).then(function(text) {
		if ((text || '').length > LOG_MAX)
			return fs.write(LOG, '').then(function() {
				ui.addNotification(null, E('p', {}, [ '日志超过 1 MB，已自动清空' ]), 'info');
			});
	});
}

function checkAddr(val) {
	if (!val || ADDR_RE.test(val))
		return true;

	return '格式应为 :端口、地址:端口 或 [IPv6]:端口';
}

return view.extend({
	load: function() {
		return callServiceList('cns', true).catch(function() { return {}; });
	},

	render: function(data) {
		var m, s, o;
		var running = isRunning(data);

		function act(cmd, btn) {
			var label = btn ? btn.textContent : '';
			var busy = { start: '启动中…', restart: '重启中…', stop: '停止中…' };

			if (btn) {
				btn.disabled = true;
				btn.textContent = busy[cmd];
			}

			return fs.exec('/etc/init.d/cns', [ cmd ]).then(function(res) {
				if (res.code !== 0)
					throw new Error((res.stderr || res.stdout || '').trim() || ('退出码 ' + res.code));

				return new Promise(function(resolve) { setTimeout(resolve, 1500); });
			}).then(function() {
				ui.addNotification(null, E('p', {}, [ '已' + { start: '启动', restart: '重启', stop: '停止' }[cmd] ]), 'info');
			}).catch(function(err) {
				ui.addNotification(null, E('p', {}, [ '操作失败：' + err.message ]), 'danger');
			}).finally(function() {
				if (btn)
					btn.textContent = label;

				return refreshStatus();
			});
		}

		function ctlBtn(title, style, cmd) {
			return E('button', {
				'id': 'cns-btn-' + cmd,
				'class': 'cbi-button ' + style,
				'disabled': running ? (cmd === 'start') : (cmd !== 'start'),
				'click': function(ev) {
					ev.preventDefault();
					return act(cmd, ev.currentTarget);
				}
			}, title);
		}

		var statusBar = E('div', { 'class': 'cbi-section' }, [
			E('div', { 'class': 'cbi-section-node' }, [
				E('div', { 'style': 'display:flex;align-items:center;gap:.6em;flex-wrap:wrap;padding:.7em 1em' }, [
					E('span', { 'id': 'cns-status', 'class': running ? 'label success' : 'label' },
						running ? '运行中' : '已停止'),
					E('span', { 'style': 'margin-left:auto;display:flex;gap:.4em' }, [
						ctlBtn('启动', 'cbi-button-positive', 'start'),
						ctlBtn('重启', 'cbi-button-apply', 'restart'),
						ctlBtn('停止', 'cbi-button-remove', 'stop')
					])
				])
			])
		]);

		m = new form.Map('cns', 'CNS 代理服务端',
			'HTTP/TLS 隧道代理 + HTTP DNS，配合 CLNC 客户端使用。');

		s = m.section(form.NamedSection, 'main', 'cns');
		s.anonymous = true;
		s.addremove = false;

		s.tab('basic', '基本');
		s.tab('tls', 'TLS');
		s.tab('misc', '其它');

		/* 基本 */
		o = s.taboption('basic', form.DynamicList, 'listen_addr', '监听地址',
			'HTTP 隧道监听地址，可填多个，例如 :2222、0.0.0.0:2222、[::]:2222');
		o.placeholder = ':2222';
		o.rmempty = false;
		o.validate = function(section_id, value) { return checkAddr(value); };

		o = s.taboption('basic', form.Value, 'proxy_key', '代理键',
			'proxy_key：请求头里用来取目标地址的字段名，默认 Meng，要和客户端填的一致');
		o.default = 'Meng';
		o.rmempty = false;
		o.validate = function(section_id, value) {
			if (!value)
				return true;
			if (/^[A-Za-z0-9-]+$/.test(value))
				return true;
			return '只能使用字母、数字和短横线';
		};

		o = s.taboption('basic', form.Value, 'udp_flag', 'UDP 隧道标识',
			'请求头里用来标记 UDP 会话的字符串，与客户端一致');
		o.default = 'httpUDP';
		o.rmempty = false;

		o = s.taboption('basic', form.Value, 'encrypt_password', '加密密码',
			'留空表示明文传输；填写后与客户端使用同一个 XOR 密码');
		o.password = true;

		o = s.taboption('basic', form.Value, 'tcp_timeout', 'TCP 超时（秒）');
		o.default = '600';
		o.datatype = 'uinteger';
		o.rmempty = false;

		o = s.taboption('basic', form.Value, 'udp_timeout', 'UDP 超时（秒）');
		o.default = '30';
		o.datatype = 'uinteger';
		o.rmempty = false;

		/* TLS */
		o = s.taboption('tls', form.DynamicList, 'tls_listen_addr', 'TLS 监听地址',
			'留空表示不开启 TLS，例如 :8978');
		o.placeholder = ':8978';
		o.validate = function(section_id, value) { return checkAddr(value); };

		o = s.taboption('tls', form.DynamicList, 'autocert_hosts', '自动签发证书的主机名',
			'按主机名自动生成自签名证书；留空表示所有主机名共用一张证书');
		o.placeholder = 'm.baidu.com';

		o = s.taboption('tls', form.Value, 'cert_file', '证书文件',
			'本地证书路径，与私钥同时填写才生效，留空则使用自动生成的证书');
		o.placeholder = '/etc/cns/cert.pem';

		o = s.taboption('tls', form.Value, 'key_file', '私钥文件');
		o.placeholder = '/etc/cns/key.pem';

		/* 其它 */
		o = s.taboption('misc', form.Flag, 'enable_httpdns', '启用 HTTP DNS',
			'客户端可用 dn=域名 直接查询，无需隧道握手');
		o.default = '1';

		o = s.taboption('misc', form.Flag, 'enable_dns_tcp_over_udp', 'TCP DNS 转 UDP',
			'把客户端的 TCP DNS 请求转成 UDP 发出，加快解析');
		o.default = '1';

		o = s.taboption('misc', form.Flag, 'enable_tfo', 'TCP FastOpen',
			'需要 root 权限，部分网络环境（如免流线路）可能不适用');
		o.default = '0';

		var logBox = E('pre', {
			'id': 'cns-log',
			'style': 'margin:0;padding:.7em 1em;max-height:22em;overflow:auto;font-size:.8em;line-height:1.5;' +
				'white-space:pre-wrap;word-break:break-all;background:rgba(0,0,0,.03);border-radius:.3em'
		}, '加载中…');

		var logSection = E('div', { 'class': 'cbi-section' }, [
			E('div', { 'style': 'display:flex;align-items:center;gap:.5em;padding:.7em 1em' }, [
				E('strong', {}, '运行日志'),
				E('span', { 'id': 'cns-log-size', 'style': 'opacity:.6;font-size:.85em' }, ''),
				E('span', { 'style': 'margin-left:auto;display:flex;gap:.4em' }, [
					E('button', {
						'class': 'cbi-button cbi-button-action',
						'click': function(ev) { ev.preventDefault(); return refreshLog(); }
					}, '刷新'),
					E('button', {
						'class': 'cbi-button cbi-button-remove',
						'click': function(ev) { ev.preventDefault(); return clearLog(); }
					}, '清空')
				])
			]),
			E('div', { 'style': 'padding:0 1em 1em' }, [ logBox ])
		]);

		applyStatus(running);
		poll.add(function() { return refreshStatus(); }, 5);

		setTimeout(function() {
			autoTrimLog().then(refreshLog);
		}, 300);

		// m.render() 返回 Promise，等表单出来再和状态条、日志拼一起
		return m.render().then(function(form) {
			return E('div', {}, [ statusBar, form, logSection ]);
		});
	}
});
