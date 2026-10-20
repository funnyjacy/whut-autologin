// ==UserScript==
// @name         WHUT 校园网自动登录
// @namespace    whut-autologin
// @version      1.1
// @description  打开 WHUT 校园网认证页时自动填账号密码并登录；失败停止重试并提示；成功后 1 秒自动关闭标签页
// @match        http://172.30.21.100/tpl/whut/login.html*
// @grant        none
// @run-at       document-start
// ==/UserScript==

(function () {
    'use strict';

    // ↓↓↓ 把这两行改成你的账号密码 ↓↓↓
    var MY_USERNAME = 'YOUR_ID';
    var MY_PASSWORD = 'YOUR_PWD';

    var FLAG_SUCCESS = 'whutAutoSuccess'; // 本次自动登录已成功（成功后页面会重载，靠它接力显示横幅并关页）
    var FLAG_STOP = 'whutAutoStop';       // 自动登录失败过，停止重试

    // ---------- 拦截 window.open（必须在 document-start 装，抢在页面脚本之前）----------
    // 登录成功后页面会弹一个 success.html 小窗（显示账号在线状态），那个窗口脚本关不掉，
    // 干脆让它别弹，信息在横幅里看。页面加载时"已在线检查"也会弹同一个窗，同样拦住。
    var RawWindowOpen = window.open;
    window.open = function (url) {
        if (String(url || '').indexOf('success.html') !== -1) return null;
        return RawWindowOpen.apply(window, arguments);
    };

    function banner(text, color) {
        var div = document.createElement('div');
        div.id = 'whut-auto-banner';
        div.textContent = '【自动登录】' + text;
        div.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:99999;'
            + 'background:' + color + ';color:#fff;padding:12px 16px;'
            + 'font-size:15px;font-weight:bold;text-align:center;';
        document.body.appendChild(div);
    }

    // ---------- 拦截登录接口的响应，拿到准确的成败结果（比"页面没跳走"可靠）----------
    var RawOpen = XMLHttpRequest.prototype.open;
    var RawSend = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.open = function (method, url) {
        this.__whutUrl = String(url);
        return RawOpen.apply(this, arguments);
    };
    XMLHttpRequest.prototype.send = function () {
        if (this.__whutUrl && this.__whutUrl.indexOf('/account/login') !== -1) {
            this.addEventListener('load', function () {
                try {
                    var r = JSON.parse(this.responseText);
                    if (r.code === 0) {
                        sessionStorage.removeItem(FLAG_STOP);
                        sessionStorage.setItem(FLAG_SUCCESS, '1');
                        banner('自动登录成功（' + MY_USERNAME + '），即将关闭此页', '#1a9c48');
                        setTimeout(function () { window.close(); }, 1000);
                    } else if (r.code === 1) {
                        // 页面自己会 alert 具体错误（如密码错误），这里补横幅并停止
                        sessionStorage.setItem(FLAG_STOP, '1');
                        banner('登录失败：' + (r.authMsg || r.msg || '未知错误') + '，已停止自动重试，请手动处理', '#c0392b');
                    } else if (r.code === 2) {
                        sessionStorage.setItem(FLAG_STOP, '1');
                        banner('服务器要求输入验证码，已停止自动重试，请在页面手动完成', '#c0392b');
                    }
                } catch (e) { /* 响应非 JSON，忽略 */ }
            });
        }
        return RawSend.apply(this, arguments);
    };

    // ---------- 以下要等 DOM 就绪 ----------
    document.addEventListener('DOMContentLoaded', function () {

        // 接力：登录成功后页面会自己重载回 login.html
        if (sessionStorage.getItem(FLAG_SUCCESS)) {
            sessionStorage.removeItem(FLAG_SUCCESS);
            sessionStorage.removeItem(FLAG_STOP);
            banner('自动登录成功（' + MY_USERNAME + '），即将关闭此页', '#1a9c48');
            setTimeout(function () { window.close(); }, 1000);
            return;
        }

        // 断网被强制跳过来时才自动登录：先查在线状态，已在线就不折腾
        var token = localStorage.getItem('token');
        if (token) {
            fetch('/api/account/status?token=' + encodeURIComponent(token))
                .then(function (res) { return res.json(); })
                .then(function (r) {
                    if (r.code === 0) return; // 已经在线，什么都不做
                    tryAutoLogin();
                })
                .catch(tryAutoLogin);
        } else {
            tryAutoLogin();
        }

        function tryAutoLogin() {
            if (sessionStorage.getItem(FLAG_STOP)) {
                banner('上一次自动登录失败，已停止重试。可修改密码后手动登录，或改脚本里的密码', '#c0392b');
                return;
            }
            var user = document.querySelector('#username');
            var pass = document.querySelector('#password');
            var btn = document.querySelector('#login-account');
            if (!user || !pass || !btn) {
                banner('找不到登录表单，脚本未执行', '#c0392b');
                return;
            }
            user.value = MY_USERNAME;
            pass.value = MY_PASSWORD;
            btn.click(); // 等价于点登录按钮，走页面自己的 checkForm()，CSRF 自动带上
        }
    });
})();
