(function () {
  'use strict';

  var REFRESH_MS = 30000;
  var QUOTE_URL = 'https://push2.eastmoney.com/api/qt/ulist.np/get?fltt=2&secids=1.000001,0.399001,0.399006,1.000688&fields=f2,f3,f4,f6,f12,f14,f104,f105,f106&cb=__emQuoteCb';
  var UT = '7eea3edcaed734bea9cbfc24409ed989';
  var ZT_URL = 'https://push2ex.eastmoney.com/getTopicZTPool?ut=' + UT + '&dpt=wz.ztzt&Pageindex=0&pagesize=100&sort=fbt%3Aasc&date=__DATE__&cb=__ztCb';
  var DT_URL = 'https://push2ex.eastmoney.com/getTopicDTPool?ut=' + UT + '&dpt=wz.ztzt&Pageindex=0&pagesize=100&sort=fund%3Aasc&date=__DATE__&cb=__dtCb';
  var SECTOR_UP_URL = 'https://push2.eastmoney.com/api/qt/clist/get?pn=1&pz=8&po=1&np=1&fltt=2&invt=2&fid=f3&fs=m:90+t:2+f:!50&fields=f2,f3,f12,f14&cb=__sectorUpCb';
  var SECTOR_DOWN_URL = 'https://push2.eastmoney.com/api/qt/clist/get?pn=1&pz=8&po=0&np=1&fltt=2&invt=2&fid=f3&fs=m:90+t:2+f:!50&fields=f2,f3,f12,f14&cb=__sectorDownCb';

  var lastQuoteToken = 0;
  var lastLimitToken = 0;
  var lastZtData = null;
  var lastDtData = null;
  var lastSectorUp = [];
  var lastSectorDown = [];

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

  function escHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
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
    if (isUp) {
      lastZtData = data;
    } else {
      lastDtData = data;
    }
    var tc = data && data.data && data.data.tc;
    if (tc != null) setText(isUp ? 'limit-up' : 'limit-down', fmtInt(tc));
    renderLivePools();
  }

  function renderLivePools() {
    var tbody = document.getElementById('live-pool-rows');
    if (!tbody) return;
    var ztArr = (lastZtData && lastZtData.data && Array.isArray(lastZtData.data.pool)) ? lastZtData.data.pool : [];
    var dtArr = (lastDtData && lastDtData.data && Array.isArray(lastDtData.data.pool)) ? lastDtData.data.pool : [];
    var len = Math.min(20, Math.max(ztArr.length, dtArr.length));
    var rows = '';
    for (var i = 0; i < len; i++) {
      var z = ztArr[i];
      var d = dtArr[i];
      rows += '<tr>'
        + '<td class="td-idx td-center">' + (i + 1) + '</td>'
        + (z
          ? '<td class="td-name">' + escHtml(z.n) + '</td>'
            + '<td class="td-num td-center" style="color:#CC0000">+' + Number(z.zdp).toFixed(2) + '%</td>'
            + '<td class="td-center">' + (z.lbc || 1) + '板</td>'
            + '<td class="td-sector">' + escHtml(z.hybk || '') + '</td>'
          : '<td class="td-name">—</td><td class="td-num td-center">—</td><td class="td-center">—</td><td class="td-sector">—</td>')
        + '<td class="td-idx td-center">' + (i + 1) + '</td>'
        + (d
          ? '<td class="td-name">' + escHtml(d.n) + '</td>'
            + '<td class="td-num td-center" style="color:#00AA00">' + Number(d.zdp).toFixed(2) + '%</td>'
          : '<td class="td-name">—</td><td class="td-num td-center">—</td>')
        + '</tr>';
    }
    tbody.innerHTML = rows;
  }

  function renderSectorRows() {
    var tbody = document.getElementById('live-sector-rows');
    if (!tbody) return;
    var upArr = Array.isArray(lastSectorUp) ? lastSectorUp : [];
    var downArr = Array.isArray(lastSectorDown) ? lastSectorDown : [];
    var len = Math.max(upArr.length, downArr.length);
    var rows = '';
    for (var i = 0; i < len; i++) {
      var u = upArr[i];
      var d = downArr[i];
      rows += '<tr>'
        + (u
          ? '<td class="td-sector-name">' + escHtml(u.f14) + '</td>'
            + '<td class="td-num td-center" style="color:#CC0000">+' + Number(u.f3).toFixed(2) + '%</td>'
          : '<td class="td-sector-name">—</td><td class="td-num td-center">—</td>')
        + (d
          ? '<td class="td-sector-name">' + escHtml(d.f14) + '</td>'
            + '<td class="td-num td-center" style="color:#00AA00">' + Number(d.f3).toFixed(2) + '%</td>'
          : '<td class="td-sector-name">—</td><td class="td-num td-center">—</td>')
        + '</tr>';
    }
    tbody.innerHTML = rows;
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
    var analysisDate = document.getElementById('analysis-date');
    if (analysisDate) analysisDate.textContent = today;
    document.title = 'A股大盘日报 - ' + today;
    try {
      if (window.Chart && Chart.instances) {
        for (var key in Chart.instances) {
          if (Object.prototype.hasOwnProperty.call(Chart.instances, key)) {
            var chart = Chart.instances[key];
            var labels = chart.data && chart.data.labels;
            if (labels && labels.length) labels[labels.length - 1] = today;
            chart.update();
          }
        }
      }
    } catch (e) {}
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

    jsonp(SECTOR_UP_URL, '__sectorUpCb').then(function (d) {
      if (quoteToken === lastQuoteToken) {
        lastSectorUp = (d && d.data && Array.isArray(d.data.diff)) ? d.data.diff : [];
        renderSectorRows();
      }
    }).catch(function () {});

    jsonp(SECTOR_DOWN_URL, '__sectorDownCb').then(function (d) {
      if (quoteToken === lastQuoteToken) {
        lastSectorDown = (d && d.data && Array.isArray(d.data.diff)) ? d.data.diff : [];
        renderSectorRows();
      }
    }).catch(function () {});
  }

  updateDateLabel();
  setTimeout(refresh, 1200);
  setInterval(refresh, REFRESH_MS);
})();
