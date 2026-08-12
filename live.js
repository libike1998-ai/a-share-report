(function () {
  'use strict';

  var REFRESH_MS = 30000;
  var QUOTE_URL = 'https://push2.eastmoney.com/api/qt/ulist.np/get?fltt=2&secids=1.000001,0.399001,0.399006,1.000688&fields=f2,f3,f4,f6,f12,f14,f104,f105,f106&cb=__emQuoteCb';
  var UT = '7eea3edcaed734bea9cbfc24409ed989';
  var ZT_URL = 'https://push2ex.eastmoney.com/getTopicZTPool?ut=' + UT + '&dpt=wz.ztzt&Pageindex=0&pagesize=100&sort=fbt%3Aasc&date=__DATE__&cb=__ztCb';
  var DT_URL = 'https://push2ex.eastmoney.com/getTopicDTPool?ut=' + UT + '&dpt=wz.ztzt&Pageindex=0&pagesize=100&sort=fund%3Aasc&date=__DATE__&cb=__dtCb';

  var lastQuoteToken = 0;
  var lastLimitToken = 0;

  function dateParam() {
    var d = new Date();
    function p(n) { return (n < 10 ? '0' : '') + n; }
    return '' + d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate());
  }

  function fmtInt(v) {
    if (v == null || isNaN(v)) return '--';
    return Number(v).toLocaleString('zh-CN', { maximumFractionDigits: 0 });
  }

  function fmtAmount(yuan) {
    if (yuan == null || isNaN(yuan)) return '--';
    var yi = yuan / 1e8;
    return yi.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function fmtPct(v) {
    if (v == null || isNaN(v)) return { text: '--', color: '#999' };
    var arrow = v > 0 ? '▲' : (v < 0 ? '▼' : '—');
    var color = v > 0 ? '#CC0000' : (v < 0 ? '#00AA00' : '#999');
    return { text: arrow + ' ' + Math.abs(v).toFixed(2) + '%', color: color };
  }

  function jsonp(url, cbName, timeoutMs) {
    return new Promise(function (resolve, reject) {
      var script = document.createElement('script');
      var done = false;
      var timer = setTimeout(function () {
        if (!done) { done = true; cleanup(); reject(new Error('timeout')); }
      }, timeoutMs || 8000);

      function cleanup() {
        if (script.parentNode) script.parentNode.removeChild(script);
        try { delete window[cbName]; } catch (e) { window[cbName] = undefined; }
      }

      window[cbName] = function (data) {
        if (done) return;
        done = true;
        clearTimeout(timer);
        cleanup();
        resolve(data);
      };

      script.onerror = function () {
        if (!done) { done = true; clearTimeout(timer); cleanup(); reject(new Error('network')); }
      };

      script.src = url + '&_t=' + Date.now();
      document.head.appendChild(script);
    });
  }

  function setText(id, text) {
    var el = document.getElementById(id);
    if (el) el.textContent = text;
  }

  function updateIndex(item, id) {
    var valEl = document.getElementById('idx-' + id);
    var chgEl = document.getElementById('chg-' + id);
    if (valEl && item.f2 != null) {
      valEl.textContent = Number(item.f2).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }
    if (chgEl && item.f3 != null) {
      var p = fmtPct(item.f3);
      chgEl.textContent = p.text;
      chgEl.style.color = p.color;
    }
  }

  function applyQuote(data) {
    var diff = data && data.data && data.data.diff;
    if (!Array.isArray(diff)) return;
    var map = {};
    diff.forEach(function (item) { map[item.f12] = item; });

    var sh = map['000001'];
    var sz = map['399001'];
    if (sh) updateIndex(sh, 'sh000001');
    if (sz) updateIndex(sz, 'sz399001');
    if (map['399006']) updateIndex(map['399006'], 'sz399006');
    if (map['000688']) updateIndex(map['000688'], 'sh000688');

    if (sh && sz) {
      setText('mkt-turnover', fmtAmount(sh.f6 + sz.f6));
      var up = (sh.f104 || 0) + (sz.f104 || 0);
      var down = (sh.f105 || 0) + (sz.f105 || 0);
      setText('mkt-up', fmtInt(up));
      setText('mkt-down', fmtInt(down));
    }
  }

  function applyLimits(data, isUp) {
    var tc = data && data.data && data.data.tc;
    if (tc == null) return;
    setText(isUp ? 'limit-up' : 'limit-down', fmtInt(tc));
  }

  function nowText() {
    return new Date().toLocaleTimeString('zh-CN', { hour12: false });
  }

  function todayLabel() {
    var d = new Date();
    function p(n) { return (n < 10 ? '0' : '') + n; }
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
  }

  function updateDateLabel() {
    var dateEl = document.querySelector('.date');
    var today = todayLabel();
    if (dateEl) {
      dateEl.innerHTML = '数据日期: ' + today + ' | 更新时间: ' + today + ' ' + nowText() + ' <span id="live-status"> | 实时刷新中</span>';
    }
    document.title = 'A股大盘日报 - ' + today;
  }

  function setStatus(text) {
    var statusEl = document.getElementById('live-status');
    if (statusEl) statusEl.textContent = text;
  }

  function refresh() {
    var quoteToken = ++lastQuoteToken;
    var limitToken = ++lastLimitToken;
    var today = dateParam();
    setStatus(' | 实时刷新中 · 最后更新 ' + nowText());

    jsonp(QUOTE_URL, '__emQuoteCb').then(function (d) {
      if (quoteToken === lastQuoteToken) applyQuote(d);
    }).catch(function () {});

    jsonp(ZT_URL.split('__DATE__').join(today), '__ztCb').then(function (d) {
      if (limitToken === lastLimitToken) applyLimits(d, true);
    }).catch(function () {});

    jsonp(DT_URL.split('__DATE__').join(today), '__dtCb').then(function (d) {
      if (limitToken === lastLimitToken) applyLimits(d, false);
    }).catch(function () {});
  }

  updateDateLabel();
  setTimeout(refresh, 1200);
  setInterval(refresh, REFRESH_MS);
})();
