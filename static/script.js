document.addEventListener("DOMContentLoaded", () => {

  /* ── refs ── */
  const fromEl   = document.getElementById("from-date");
  const toEl     = document.getElementById("to-date");
  const typeEl   = document.getElementById("transaction-type");
  const applyBtn = document.getElementById("apply-filters");
  const clearBtn = document.getElementById("clear-filters");
  const exportBtn= document.getElementById("export-csv");
  const searchEl = document.getElementById("global-search");
  const tooltip  = document.getElementById("heatmap-tooltip");

  /* ── state ── */
  let trendChart = null;
  let typeChart  = null;
  let activeTrend  = "amounts";
  let activeType   = "doughnut";
  let allTxData    = [];
  let cachedDist   = {};
  let cachedTrends = {};

  const COLORS = ["#F9CA24","#F0932B","#6AB04C","#686DE0","#E056FD","#22A6B3","#EB4D4B","#7ED6DF","#30336B","#16A34A"];

  /* ── type config ── */
  const TYPE_CFG = {
    "Bank Deposit":                  { icon: "fa-building-columns", bg: "#F0FDF4", color: "#16A34A", credit: true  },
    "Incoming Money":                { icon: "fa-arrow-down-to-line",bg:"#F0FDF4", color: "#16A34A", credit: true  },
    "Transfer To Mobile Number":     { icon: "fa-arrow-up-right",   bg: "#FEF2F2", color: "#DC2626", credit: false },
    "Withdrawal from Agent":         { icon: "fa-money-bill-wave",   bg: "#FEF2F2", color: "#DC2626", credit: false },
    "Payment to Code":               { icon: "fa-qrcode",            bg: "#FEF2F2", color: "#DC2626", credit: false },
    "Airtime Bill":                  { icon: "fa-phone",             bg: "#FFF7ED", color: "#EA580C", credit: false },
    "Cash Power":                    { icon: "fa-bolt",              bg: "#FFF7ED", color: "#EA580C", credit: false },
    "Internet and Voice Bundle":     { icon: "fa-wifi",              bg: "#EFF6FF", color: "#2563EB", credit: false },
    "OTP Message":                   { icon: "fa-shield-halved",     bg: "#F5F3FF", color: "#7C3AED", credit: false },
  };

  const DEFAULT_CFG = { icon: "fa-circle-dot", bg: "#F9FAFB", color: "#6B7280", credit: false };

  function typeCfg(type) { return TYPE_CFG[type] || DEFAULT_CFG; }

  /* ── helpers ── */
  function fmt(n) {
    return new Intl.NumberFormat("rw-RW", { style: "currency", currency: "RWF", maximumFractionDigits: 0 }).format(n);
  }

  function buildParams() {
    const p = new URLSearchParams();
    if (fromEl.value) p.set("from_date", fromEl.value);
    if (toEl.value)   p.set("to_date",   toEl.value);
    const t = typeEl.value;
    if (t && t !== "All") p.set("transaction_type", t);
    return p.toString();
  }

  function isDark() { return document.body.getAttribute("data-theme") === "dark"; }

  function chartC() {
    return isDark()
      ? { text: "#4B5563", grid: "#2A2C36", bg: "#18191F" }
      : { text: "#9CA3AF", grid: "#F3F4F6", bg: "#FFFFFF" };
  }

  /* count-up */
  function countUp(el, target, toStr) {
    const dur = 800, t0 = performance.now();
    (function tick(now) {
      const p = Math.min((now - t0) / dur, 1);
      el.textContent = toStr(Math.round(target * (1 - Math.pow(1 - p, 3))));
      if (p < 1) requestAnimationFrame(tick);
    })(t0);
  }

  /* trend badge */
  function renderTrend(el, val, label) {
    if (val === null || val === undefined) { el.textContent = ""; el.className = "sc-trend"; return; }
    const up = val >= 0;
    el.className = "sc-trend " + (up ? "trend-up" : "trend-down");
    el.innerHTML = `<i class="fas fa-arrow-${up ? "up" : "down"}"></i> ${up ? "+" : ""}${val}% ${label}`;
  }

  /* line chart gradient */
  function mkGrad(ctx) {
    const g = ctx.createLinearGradient(0, 0, 0, 240);
    g.addColorStop(0, isDark() ? "rgba(249,202,36,.18)" : "rgba(249,202,36,.22)");
    g.addColorStop(1, "rgba(249,202,36,0)");
    return g;
  }

  /* ── theme ── */
  function applyTheme(dark) {
    dark ? document.body.setAttribute("data-theme","dark") : document.body.removeAttribute("data-theme");
    localStorage.setItem("momo-theme", dark ? "dark" : "light");
    document.getElementById("dark-mode-btn").classList.toggle("active", dark);
    document.getElementById("light-mode-btn").classList.toggle("active", !dark);
    if (Object.keys(cachedDist).length)   renderTypeChart(cachedDist);
    if (Object.keys(cachedTrends).length) renderTrendChart(cachedTrends);
  }

  applyTheme(localStorage.getItem("momo-theme") === "dark");

  /* ── DASHBOARD DATA ── */
  async function loadDashboard() {
    const res  = await fetch(`/api/dashboard-data?${buildParams()}`);
    const data = await res.json();

    countUp(document.getElementById("stat-total-tx"),     data.totalTransactions, n => n.toLocaleString());
    countUp(document.getElementById("stat-total-amount"), data.totalAmount,        n => fmt(n));
    countUp(document.getElementById("stat-total-fees"),   data.totalFees,          n => fmt(n));
    document.getElementById("stat-top-type").textContent = data.topType || "—";

    renderTrend(document.getElementById("trend-tx"),     data.trends?.transactions, "vs last month");
    renderTrend(document.getElementById("trend-amount"), data.trends?.amount,       "vs last month");
    renderTrend(document.getElementById("trend-fees"),   data.trends?.fees,         "vs last month");

    cachedDist = data.typeDistribution;
    renderTypeChart(data.typeDistribution);
  }

  /* ── TRENDS ── */
  async function loadTrends() {
    const res  = await fetch(`/api/monthly-trends?${buildParams()}`);
    const data = await res.json();
    cachedTrends = data;
    renderTrendChart(data);
  }

  function renderTrendChart(data) {
    if (trendChart) trendChart.destroy();
    const canvas = document.getElementById("trendChart");
    const ctx    = canvas.getContext("2d");
    const c      = chartC();
    const labels = { amounts: "Volume (RWF)", counts: "Transactions", fees: "Fees (RWF)" };

    trendChart = new Chart(ctx, {
      type: "line",
      data: {
        labels: data.months,
        datasets: [{
          label: labels[activeTrend],
          data:  data[activeTrend] || [],
          borderColor: "#F9CA24",
          borderWidth: 2.5,
          backgroundColor: mkGrad(ctx),
          pointBackgroundColor: "#F9CA24",
          pointBorderColor: isDark() ? "#18191F" : "#fff",
          pointBorderWidth: 2,
          pointRadius: 5,
          pointHoverRadius: 7,
          fill: true,
          tension: 0.42,
        }],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        interaction: { mode: "index", intersect: false },
        plugins: {
          legend: { display: false },
          datalabels: { display: false },
          tooltip: {
            backgroundColor: isDark() ? "#1E2028" : "#111827",
            titleColor: c.text,
            bodyColor: isDark() ? "#F3F4F6" : "#fff",
            padding: 10, cornerRadius: 8,
            callbacks: { label: ctx => activeTrend === "counts" ? `  ${ctx.raw} txns` : `  ${fmt(ctx.raw)}` }
          }
        },
        scales: {
          x: { grid: { display: false }, border: { display: false }, ticks: { color: c.text, font: { size: 11 } } },
          y: { grid: { color: c.grid  }, border: { display: false }, ticks: { color: c.text, font: { size: 11 }, maxTicksLimit: 5, callback: v => activeTrend === "counts" ? v : fmt(v) } }
        }
      },
      plugins: [ChartDataLabels],
    });
  }

  /* ── TYPE CHART ── */
  function renderTypeChart(dist) {
    if (typeChart) typeChart.destroy();
    const labels = Object.keys(dist), values = Object.values(dist);
    const total  = values.reduce((a, b) => a + b, 0);
    const ctx    = document.getElementById("typeChart").getContext("2d");
    const c      = chartC();
    const isDough = activeType === "doughnut";

    typeChart = new Chart(ctx, {
      type: activeType,
      data: {
        labels,
        datasets: [{
          data: values,
          backgroundColor: COLORS,
          borderColor: isDough ? (isDark() ? "#18191F" : "#fff") : COLORS,
          borderWidth: isDough ? 2 : 0,
          borderRadius: isDough ? 0 : 4,
          hoverOffset: isDough ? 6 : 0,
        }],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        cutout: isDough ? "70%" : 0,
        plugins: {
          legend: { position: "bottom", labels: { font: { size: 11, weight: "500" }, color: c.text, padding: 12, boxWidth: 10, boxHeight: 10, usePointStyle: true, pointStyle: "circle" } },
          datalabels: {
            display: ctx => (ctx.dataset.data[ctx.dataIndex] / total) > 0.06,
            color: "#fff", font: { weight: "700", size: 11 },
            formatter: v => `${Math.round(v / total * 100)}%`,
          },
          tooltip: {
            backgroundColor: isDark() ? "#1E2028" : "#111827",
            titleColor: c.text, bodyColor: isDark() ? "#F3F4F6" : "#fff",
            padding: 10, cornerRadius: 8,
            callbacks: { label: ctx => `  ${ctx.label}: ${ctx.raw} (${Math.round(ctx.raw/total*100)}%)` }
          }
        },
        ...(isDough ? {} : { scales: {
          x: { grid:{display:false}, border:{display:false}, ticks:{color:c.text,font:{size:10},maxRotation:35} },
          y: { grid:{color:c.grid},  border:{display:false}, ticks:{color:c.text,font:{size:11},maxTicksLimit:5} }
        }})
      },
      plugins: [ChartDataLabels,
        ...(isDough ? [{
          id: "center",
          afterDraw(chart) {
            const { width, height, ctx } = chart;
            const cx = width / 2, cy = height / 2 - (chart.legend?.height || 0) / 2;
            ctx.save();
            ctx.font = `800 24px Inter,sans-serif`;
            ctx.fillStyle = isDark() ? "#F3F4F6" : "#111827";
            ctx.textAlign = "center"; ctx.textBaseline = "middle";
            ctx.fillText(total, cx, cy - 9);
            ctx.font = `500 11px Inter,sans-serif`;
            ctx.fillStyle = isDark() ? "#9CA3AF" : "#9CA3AF";
            ctx.fillText("transactions", cx, cy + 13);
            ctx.restore();
          }
        }] : [])
      ],
    });
  }

  /* ── HEATMAP ── */
  async function loadHeatmap() {
    const res  = await fetch("/api/activity-heatmap");
    const data = await res.json();
    renderHeatmap(data);
  }

  function heatColor(n) {
    if (!n)    return isDark() ? "#2A2C36" : "#EAECF2";
    if (n < 2) return "#FFF0A0";
    if (n < 3) return "#F9CA24";
    if (n < 5) return "#E1A800";
    return "#B8860B";
  }

  function renderHeatmap(data) {
    const grid = document.getElementById("heatmap-grid");
    const mths = document.getElementById("heatmap-months");
    grid.innerHTML = mths.innerHTML = "";

    const dates = Object.keys(data).sort();
    if (!dates.length) return;
    const start = new Date(dates[0]), end = new Date(dates[dates.length - 1]);
    const first = new Date(start);
    first.setDate(first.getDate() - ((first.getDay() + 6) % 7));

    let cur = new Date(first), col = 0, monthPos = {};

    while (cur <= end) {
      const colEl = document.createElement("div");
      colEl.className = "heatmap-col";
      for (let d = 0; d < 7; d++) {
        const cell = document.createElement("div");
        cell.className = "heatmap-cell";
        const key = cur.toISOString().split("T")[0];
        const inRange = cur >= start && cur <= end;
        const count   = data[key] || 0;
        cell.style.background = inRange ? heatColor(count) : "transparent";
        if (inRange) {
          const dl = cur.toLocaleDateString("en", { weekday:"short", month:"short", day:"numeric" });
          cell.addEventListener("mouseenter", () => {
            tooltip.textContent = `${dl} — ${count || "no"} transaction${count !== 1 ? "s" : ""}`;
            tooltip.classList.add("visible");
          });
          cell.addEventListener("mousemove", e => { tooltip.style.left = (e.clientX+12)+"px"; tooltip.style.top = (e.clientY-32)+"px"; });
          cell.addEventListener("mouseleave", () => tooltip.classList.remove("visible"));
          if (d === 0) {
            const mn = cur.toLocaleDateString("en", { month: "short" });
            if (cur.getDate() <= 7 && !monthPos[mn]) monthPos[mn] = col;
          }
        }
        colEl.appendChild(cell);
        cur.setDate(cur.getDate() + 1);
      }
      grid.appendChild(colEl);
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
      lbl.style.width = (cw * 4) + "px";
      lbl.style.marginLeft = (c * cw) + "px";
      mths.appendChild(lbl);
    });
  }

  /* ── RIGHT PANEL (recent, date-grouped) ── */
  async function loadRightPanel() {
    const res  = await fetch("/transactions");
    const all  = await res.json();
    allTxData  = all;
    renderAllTable(all);
    renderRightPanel(all.slice(0, 40));
  }

  function renderRightPanel(txs) {
    const body = document.getElementById("rp-body");
    if (!txs.length) { body.innerHTML = `<div class="empty-cell">No transactions</div>`; return; }

    /* group by date */
    const groups = {};
    txs.forEach(tx => {
      const d = tx.date.split(" ")[0];
      if (!groups[d]) groups[d] = [];
      groups[d].push(tx);
    });

    body.innerHTML = Object.entries(groups).map(([date, rows]) => {
      const label = new Date(date + "T00:00:00").toLocaleDateString("en", { month: "long", day: "numeric", year: "numeric" });
      const rowsHTML = rows.map(tx => {
        const cfg    = typeCfg(tx.type);
        const credit = cfg.credit;
        const amtStr = (credit ? "+" : "−") + fmt(tx.amount);
        const time   = tx.date.split(" ")[1] || "";
        return `
          <div class="tx-row">
            <div class="tx-type-icon" style="background:${cfg.bg};color:${cfg.color};">
              <i class="fas ${cfg.icon}"></i>
            </div>
            <div class="tx-info">
              <div class="tx-name">${tx.type}</div>
              <div class="tx-time">${time}</div>
            </div>
            <div class="tx-amount ${credit ? "credit" : "debit"}">${amtStr}</div>
          </div>`;
      }).join("");

      return `<div class="tx-date-group">
        <div class="tx-date-label">${label}</div>
      </div>${rowsHTML}`;
    }).join("");
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

  /* ── SCROLL SPY ── */
  function initScrollSpy() {
    const ids = ["overview","trends","activity","all-transactions"];
    const obs = new IntersectionObserver(entries => {
      entries.forEach(e => {
        if (e.isIntersecting) {
          document.querySelectorAll(".nav-icon").forEach(l => l.classList.remove("active"));
          document.querySelector(`.nav-icon[href="#${e.target.id}"]`)?.classList.add("active");
        }
      });
    }, { rootMargin: "-25% 0px -65% 0px" });
    ids.map(id => document.getElementById(id)).filter(Boolean).forEach(el => obs.observe(el));
  }

  /* ── EVENTS ── */
  document.getElementById("light-mode-btn").addEventListener("click", () => applyTheme(false));
  document.getElementById("dark-mode-btn").addEventListener("click",  () => applyTheme(true));
  document.getElementById("rp-refresh")?.addEventListener("click",    () => loadRightPanel());

  document.querySelectorAll("#trend-tabs .pill").forEach(btn =>
    btn.addEventListener("click", () => {
      document.querySelectorAll("#trend-tabs .pill").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      activeTrend = btn.dataset.metric;
      loadTrends();
    })
  );

  document.querySelectorAll("#type-tabs .pill").forEach(btn =>
    btn.addEventListener("click", () => {
      document.querySelectorAll("#type-tabs .pill").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      activeType = btn.dataset.type;
      if (Object.keys(cachedDist).length) renderTypeChart(cachedDist);
    })
  );

  applyBtn.addEventListener("click",  () => { loadDashboard(); loadTrends(); });
  clearBtn.addEventListener("click",  () => { fromEl.value = toEl.value = ""; typeEl.value = "All"; loadDashboard(); loadTrends(); });
  exportBtn.addEventListener("click", () => { window.location.href = `/api/export-csv?${buildParams()}`; });

  searchEl.addEventListener("input", () => {
    const q = searchEl.value.toLowerCase().trim();
    const filtered = q ? allTxData.filter(tx =>
      tx.transaction_id.toLowerCase().includes(q) ||
      tx.type.toLowerCase().includes(q) ||
      tx.date.includes(q)) : allTxData;
    renderAllTable(filtered);
    if (q.length > 1) document.getElementById("all-transactions")?.scrollIntoView({ behavior: "smooth" });
  });

  /* ── INIT ── */
  loadDashboard();
  loadTrends();
  loadHeatmap();
  loadRightPanel();
  initScrollSpy();
});
