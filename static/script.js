document.addEventListener("DOMContentLoaded", () => {

  /* ── refs ── */
  const fromEl    = document.getElementById("from-date");
  const toEl      = document.getElementById("to-date");
  const typeEl    = document.getElementById("transaction-type");
  const applyBtn  = document.getElementById("apply-filters");
  const clearBtn  = document.getElementById("clear-filters");
  const exportBtn = document.getElementById("export-csv");
  const searchEl  = document.getElementById("global-search");
  const htTooltip = document.getElementById("heatmap-tooltip");

  let volumeChart = null;
  let allTxData   = [];
  let cachedTrends = {};
  let cachedDist   = {};

  /* ── type config ── */
  const TCFG = {
    "Bank Deposit":               { icon:"fa-building-columns",     bg:"#F0FDF4", color:"#16A34A", credit:true  },
    "Incoming Money":             { icon:"fa-circle-arrow-down",    bg:"#F0FDF4", color:"#16A34A", credit:true  },
    "Transfer To Mobile Number":  { icon:"fa-paper-plane",          bg:"#FEF2F2", color:"#DC2626", credit:false },
    "Withdrawal from Agent":      { icon:"fa-money-bill-wave",      bg:"#FEF2F2", color:"#DC2626", credit:false },
    "Payment to Code":            { icon:"fa-qrcode",               bg:"#FFF7ED", color:"#EA580C", credit:false },
    "Airtime Bill":               { icon:"fa-phone",                bg:"#FFF7ED", color:"#EA580C", credit:false },
    "Cash Power":                 { icon:"fa-bolt",                 bg:"#FEFCE8", color:"#CA8A04", credit:false },
    "Internet and Voice Bundle":  { icon:"fa-wifi",                 bg:"#EFF6FF", color:"#2563EB", credit:false },
    "OTP Message":                { icon:"fa-shield-halved",        bg:"#F5F3FF", color:"#7C3AED", credit:false },
  };
  const DEF = { icon:"fa-circle-dot", bg:"#F9FAFB", color:"#6B7280", credit:false };
  const tc  = t => TCFG[t] || DEF;

  /* ── helpers ── */
  function fmt(n) {
    return new Intl.NumberFormat("rw-RW", { style:"currency", currency:"RWF", maximumFractionDigits:0 }).format(n);
  }

  function fmtShort(n) {
    if (n >= 1_000_000) return `RWF ${(n/1_000_000).toFixed(1)}M`;
    if (n >= 1_000)     return `RWF ${(n/1_000).toFixed(0)}K`;
    return `RWF ${n}`;
  }

  function buildP() {
    const p = new URLSearchParams();
    if (fromEl.value) p.set("from_date", fromEl.value);
    if (toEl.value)   p.set("to_date",   toEl.value);
    const t = typeEl.value;
    if (t && t !== "All") p.set("transaction_type", t);
    return p.toString();
  }

  function isDark() { return document.body.getAttribute("data-theme") === "dark"; }

  function countUp(el, target, toStr) {
    const dur = 800, t0 = performance.now();
    (function tick(now) {
      const p = Math.min((now-t0)/dur, 1);
      el.textContent = toStr(Math.round(target * (1-Math.pow(1-p,3))));
      if (p < 1) requestAnimationFrame(tick);
    })(t0);
  }

  function trend(el, val, label) {
    if (val === null || val === undefined) { el.textContent=""; el.className="sc-trend"; return; }
    const up = val >= 0;
    el.className = "sc-trend " + (up ? "trend-up" : "trend-down");
    el.innerHTML = `<i class="fas fa-arrow-${up?"up":"down"}"></i> ${up?"+":""}${val}% ${label}`;
  }

  /* ── theme ── */
  function applyTheme(dark) {
    dark ? document.body.setAttribute("data-theme","dark") : document.body.removeAttribute("data-theme");
    localStorage.setItem("momo-theme", dark ? "dark" : "light");
    document.getElementById("dark-mode-btn").classList.toggle("active", dark);
    document.getElementById("light-mode-btn").classList.toggle("active", !dark);
    document.querySelectorAll(".tnl").forEach(l => l.classList.remove("active"));
    /* re-render charts with correct colors */
    if (Object.keys(cachedTrends).length) renderVolumeChart(cachedTrends);
  }

  applyTheme(localStorage.getItem("momo-theme") === "dark");

  /* ── DASHBOARD ── */
  async function loadDashboard() {
    const res  = await fetch(`/api/dashboard-data?${buildP()}`);
    const data = await res.json();

    countUp(document.getElementById("stat-total-tx"),     data.totalTransactions, n => n.toLocaleString());
    countUp(document.getElementById("stat-total-amount"), data.totalAmount,        n => fmt(n));
    countUp(document.getElementById("stat-total-fees"),   data.totalFees,          n => fmt(n));

    const avg = data.totalTransactions > 0 ? Math.round(data.totalAmount / data.totalTransactions) : 0;
    countUp(document.getElementById("stat-avg-tx"), avg, n => fmt(n));

    trend(document.getElementById("trend-tx"),     data.trends?.transactions, "vs last month");
    trend(document.getElementById("trend-amount"), data.trends?.amount,       "vs last month");
    trend(document.getElementById("trend-fees"),   data.trends?.fees,         "vs last month");

    cachedDist = data.typeDistribution;
    renderFeaturedCard(data.typeDistribution, data.totalTransactions);
    renderTypeBreakdown(data.typeDistribution, data.totalTransactions);
    renderMiniTypes(data.typeDistribution, data.totalTransactions);
  }

  /* ── MINI TYPE BARS (inside stats card) ── */
  function renderMiniTypes(dist, total) {
    const el = document.getElementById("ts-mini-types");
    if (!el) return;
    const top5 = Object.entries(dist).sort((a, b) => b[1] - a[1]).slice(0, 5);
    el.innerHTML = top5.map(([name, count]) => {
      const pct = Math.round(count / total * 100);
      const cfg = tc(name);
      const shortName = name.replace("To Mobile Number","").replace("from Agent","").replace("and Voice","").trim();
      return `<div class="mtt-row">
        <span class="mtt-name">${shortName}</span>
        <div class="mtt-bar"><div class="mtt-fill" style="width:${pct}%;background:${cfg.color};"></div></div>
        <span class="mtt-pct">${pct}%</span>
      </div>`;
    }).join("");
  }

  /* ── VOLUME BAR CHART ── */
  async function loadTrends() {
    const res  = await fetch(`/api/monthly-trends?${buildP()}`);
    const data = await res.json();
    cachedTrends = data;

    /* busiest month */
    if (data.months?.length) {
      const maxIdx = data.counts.indexOf(Math.max(...data.counts));
      document.getElementById("stat-best-month").textContent = data.months[maxIdx] || "—";
    }

    renderVolumeChart(data);
  }

  function renderVolumeChart(data) {
    if (volumeChart) volumeChart.destroy();
    const canvas = document.getElementById("volumeChart");
    const ctx    = canvas.getContext("2d");
    const dark   = isDark();
    const amounts = data.amounts || [];
    const maxAmt  = Math.max(...amounts, 1);

    volumeChart = new Chart(ctx, {
      type: "bar",
      data: {
        labels: (data.months || []).map(m => m.split(" ")[0]), // short month
        datasets: [{
          data: amounts,
          backgroundColor: amounts.map((v, i) =>
            i === amounts.length - 1 ? "#F9CA24"
            : dark ? "rgba(249,202,36,.25)" : "rgba(249,202,36,.35)"
          ),
          borderRadius: 6,
          borderSkipped: false,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          datalabels: { display: false },
          tooltip: {
            backgroundColor: dark ? "#1B1D28" : "#111827",
            titleColor: dark ? "#9CA3AF" : "#6B7280",
            bodyColor: dark ? "#F3F4F6" : "#fff",
            padding: 10,
            cornerRadius: 8,
            callbacks: { label: ctx => `  ${fmt(ctx.raw)}` }
          }
        },
        scales: {
          x: {
            grid: { display: false },
            border: { display: false },
            ticks: { color: dark ? "#4B5563" : "#9CA3AF", font: { size: 11 } }
          },
          y: { display: false }
        }
      },
      plugins: [ChartDataLabels],
    });
  }

  /* ── FEATURED CARD ── */
  const TAG_COLORS = [
    { bg:"#FEF9C3", color:"#854D0E" },
    { bg:"#DCFCE7", color:"#166534" },
    { bg:"#EDE9FE", color:"#5B21B6" },
    { bg:"#DBEAFE", color:"#1E40AF" },
    { bg:"#FEE2E2", color:"#991B1B" },
  ];

  function renderFeaturedCard(dist, total) {
    const sorted = Object.entries(dist).sort((a, b) => b[1] - a[1]);
    const topTwo = sorted.slice(0, 2);

    const tagsEl = document.getElementById("featured-tags");
    tagsEl.innerHTML = topTwo.map(([name], i) => {
      const c = TAG_COLORS[i % TAG_COLORS.length];
      return `<span class="bf-tag" style="background:${c.bg};color:${c.color};">${name}</span>`;
    }).join("");

    const [topName, topCount] = sorted[0] || ["—", 0];
    const pct = total > 0 ? Math.round(topCount / total * 100) : 0;
    const cfg = tc(topName);

    document.getElementById("featured-type").textContent = topName;
    document.getElementById("featured-desc").innerHTML =
      `<i class="fas ${cfg.icon}" style="color:${cfg.color};margin-right:6px;"></i>
       ${topCount} transactions — ${pct}% of all activity. Most frequent type in your data.`;
    document.getElementById("featured-fill").style.width = pct + "%";
    document.getElementById("featured-pct").textContent = pct + "%";
  }

  /* ── TYPE BREAKDOWN LIST ── */
  function renderTypeBreakdown(dist, total) {
    const el     = document.getElementById("type-list");
    const sorted = Object.entries(dist).sort((a, b) => b[1] - a[1]);
    const max    = sorted[0]?.[1] || 1;

    el.innerHTML = sorted.map(([name, count]) => {
      const cfg = tc(name);
      const w   = Math.round(count / max * 100);
      return `
        <div class="type-row">
          <div class="tr-icon" style="background:${cfg.bg};color:${cfg.color};">
            <i class="fas ${cfg.icon}"></i>
          </div>
          <div class="tr-info">
            <div class="tr-name">${name}</div>
            <div class="tr-bar-wrap">
              <div class="tr-bar-fill" style="width:${w}%;background:${cfg.color};opacity:.7;"></div>
            </div>
          </div>
          <div class="tr-count">${count}</div>
        </div>`;
    }).join("");
  }

  /* ── RECENT TRANSACTIONS (date-grouped) ── */
  async function loadRecent() {
    const res = await fetch("/transactions");
    allTxData = await res.json();
    renderAllTable(allTxData);
    renderRecentList(allTxData.slice(0, 40));
  }

  function renderRecentList(txs) {
    const el = document.getElementById("recent-list");
    if (!txs.length) { el.innerHTML = `<div class="empty-cell">No transactions</div>`; return; }

    const groups = {};
    txs.forEach(tx => {
      const d = tx.date.split(" ")[0];
      (groups[d] = groups[d] || []).push(tx);
    });

    el.innerHTML = `<div class="recent-scroll">` + Object.entries(groups).map(([date, rows]) => {
      const label = new Date(date + "T00:00:00").toLocaleDateString("en", { month:"long", day:"numeric", year:"numeric" });
      return `<div class="rx-date-label">${label}</div>` +
        rows.map(tx => {
          const cfg = tc(tx.type);
          const credit = cfg.credit;
          const amtStr = (credit ? "+" : "−") + fmt(tx.amount);
          return `<div class="rx-row">
            <div class="rx-icon" style="background:${cfg.bg};color:${cfg.color};">
              <i class="fas ${cfg.icon}"></i>
            </div>
            <div class="rx-info">
              <div class="rx-name">${tx.type}</div>
              <div class="rx-time">${tx.date.split(" ")[1] || ""}</div>
            </div>
            <div class="rx-amt ${credit?"credit":"debit"}">${amtStr}</div>
          </div>`;
        }).join("");
    }).join("") + `</div>`;
  }

  /* ── ALL TRANSACTIONS TABLE ── */
  function renderAllTable(rows) {
    const tbody = document.getElementById("transaction-table-body");
    const count = document.getElementById("record-count");
    if (count) count.textContent = `${rows.length} records`;
    tbody.innerHTML = rows.length
      ? rows.map(tx => `<tr>
          <td class="tx-id">${tx.transaction_id}</td>
          <td>${tx.date}</td>
          <td class="type">${tx.type}</td>
          <td class="amount">${fmt(tx.amount)}</td>
          <td class="fee">${fmt(tx.fee)}</td>
        </tr>`).join("")
      : `<tr><td colspan="5" class="empty-cell">No transactions found</td></tr>`;
  }

  /* ── HEATMAP ── */
  async function loadHeatmap() {
    const res  = await fetch("/api/activity-heatmap");
    const data = await res.json();
    const grid = document.getElementById("heatmap-grid");
    const mths = document.getElementById("heatmap-months");
    grid.innerHTML = mths.innerHTML = "";

    const dates = Object.keys(data).sort();
    if (!dates.length) return;
    const start = new Date(dates[0]), end = new Date(dates[dates.length-1]);
    const first = new Date(start);
    first.setDate(first.getDate() - ((first.getDay()+6)%7));

    let cur = new Date(first), col = 0, monthPos = {};

    function hc(n) {
      if (!n)   return isDark() ? "#252836" : "#E5E7EB";
      if (n < 2) return "#FFF0A0";
      if (n < 3) return "#F9CA24";
      if (n < 5) return "#D4A017";
      return "#B8860B";
    }

    while (cur <= end) {
      const ce = document.createElement("div");
      ce.className = "heatmap-col";
      for (let d = 0; d < 7; d++) {
        const cell = document.createElement("div");
        cell.className = "heatmap-cell";
        const key = cur.toISOString().split("T")[0];
        const inRange = cur >= start && cur <= end;
        const count = data[key] || 0;
        cell.style.background = inRange ? hc(count) : "transparent";
        if (inRange) {
          const dl = cur.toLocaleDateString("en", { weekday:"short", month:"short", day:"numeric" });
          cell.addEventListener("mouseenter", () => {
            htTooltip.textContent = `${dl} — ${count || "no"} transaction${count !== 1 ? "s" : ""}`;
            htTooltip.classList.add("visible");
          });
          cell.addEventListener("mousemove", e => {
            htTooltip.style.left = (e.clientX+12)+"px";
            htTooltip.style.top  = (e.clientY-32)+"px";
          });
          cell.addEventListener("mouseleave", () => htTooltip.classList.remove("visible"));
          if (d === 0) {
            const mn = cur.toLocaleDateString("en", { month:"short" });
            if (cur.getDate() <= 7 && !monthPos[mn]) monthPos[mn] = col;
          }
        }
        ce.appendChild(cell);
        cur.setDate(cur.getDate()+1);
      }
      grid.appendChild(ce);
      col++;
    }

    const cw = 15;
    let last = -4;
    Object.entries(monthPos).forEach(([name, c]) => {
      if (c - last < 3) return;
      last = c;
      const lbl = document.createElement("div");
      lbl.className = "heatmap-month-label";
      lbl.textContent = name;
      lbl.style.width = (cw*4)+"px";
      lbl.style.marginLeft = (c*cw)+"px";
      mths.appendChild(lbl);
    });
  }

  /* ── NAV SCROLL SPY ── */
  function initScrollSpy() {
    const ids = ["overview","breakdown","activity","all-data"];
    const obs = new IntersectionObserver(entries => {
      entries.forEach(e => {
        if (e.isIntersecting) {
          document.querySelectorAll(".tnl").forEach(l => l.classList.remove("active"));
          document.querySelector(`.tnl[href="#${e.target.id}"]`)?.classList.add("active");
        }
      });
    }, { rootMargin: "-20% 0px -70% 0px" });
    ids.map(id => document.getElementById(id)).filter(Boolean).forEach(el => obs.observe(el));
  }

  /* ── EVENTS ── */
  document.getElementById("light-mode-btn").addEventListener("click", () => applyTheme(false));
  document.getElementById("dark-mode-btn").addEventListener("click",  () => applyTheme(true));
  document.getElementById("rp-refresh")?.addEventListener("click",    loadRecent);

  applyBtn.addEventListener("click",  () => { loadDashboard(); loadTrends(); });
  clearBtn.addEventListener("click",  () => { fromEl.value = toEl.value = ""; typeEl.value = "All"; loadDashboard(); loadTrends(); });
  exportBtn.addEventListener("click", () => { window.location.href = `/api/export-csv?${buildP()}`; });

  searchEl.addEventListener("input", () => {
    const q = searchEl.value.toLowerCase().trim();
    const filtered = q
      ? allTxData.filter(tx =>
          tx.transaction_id.toLowerCase().includes(q) ||
          tx.type.toLowerCase().includes(q) ||
          tx.date.includes(q))
      : allTxData;
    renderAllTable(filtered);
    if (q.length > 1) document.getElementById("all-data")?.scrollIntoView({ behavior:"smooth" });
  });

  /* ── INIT ── */
  loadDashboard();
  loadTrends();
  loadHeatmap();
  loadRecent();
  initScrollSpy();
});
