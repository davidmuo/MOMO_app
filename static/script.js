/* ─────────────────────────────────────────────
   MoMo Dashboard
───────────────────────────────────────────── */
document.addEventListener("DOMContentLoaded", () => {

  /* ── DOM refs ── */
  const fromDateEl = document.getElementById("from-date");
  const toDateEl   = document.getElementById("to-date");
  const typeEl     = document.getElementById("transaction-type");
  const applyBtn   = document.getElementById("apply-filters");
  const clearBtn   = document.getElementById("clear-filters");
  const exportBtn  = document.getElementById("export-csv");
  const searchEl   = document.getElementById("global-search");
  const tooltip    = document.getElementById("heatmap-tooltip");

  /* ── state ── */
  let trendChart   = null;
  let typeChart    = null;
  let activeTrend  = "amounts";
  let activeType   = "doughnut";
  let allTxData    = [];
  let cachedDist   = {};
  let cachedTrends = {};

  const COLORS = [
    "#F9CA24","#F0932B","#6AB04C","#686DE0",
    "#E056FD","#22A6B3","#EB4D4B","#7ED6DF",
    "#30336B","#16A34A"
  ];

  /* ─────────────────────────────────────────
     THEME
  ───────────────────────────────────────── */
  function isDark() {
    return document.body.getAttribute("data-theme") === "dark";
  }

  function chartColors() {
    return isDark()
      ? { text: "#8A90AA", grid: "#252A40", tooltip: "#1C2035" }
      : { text: "#9DA3BC", grid: "#F0F3FB", tooltip: "#1A1D2E" };
  }

  function applyTheme(dark) {
    if (dark) {
      document.body.setAttribute("data-theme", "dark");
    } else {
      document.body.removeAttribute("data-theme");
    }
    localStorage.setItem("momo-theme", dark ? "dark" : "light");

    document.getElementById("dark-mode-btn").classList.toggle("active", dark);
    document.getElementById("light-mode-btn").classList.toggle("active", !dark);

    /* re-render charts with new palette */
    if (Object.keys(cachedDist).length)   renderTypeChart(cachedDist);
    if (Object.keys(cachedTrends).length) renderTrendChart(cachedTrends);
  }

  /* restore saved theme */
  applyTheme(localStorage.getItem("momo-theme") === "dark");

  /* ─────────────────────────────────────────
     HELPERS
  ───────────────────────────────────────── */
  function fmt(n) {
    return new Intl.NumberFormat("rw-RW", {
      style: "currency", currency: "RWF", maximumFractionDigits: 0
    }).format(n);
  }

  function buildParams() {
    const p = new URLSearchParams();
    if (fromDateEl.value) p.set("from_date", fromDateEl.value);
    if (toDateEl.value)   p.set("to_date",   toDateEl.value);
    const t = typeEl.value;
    if (t && t !== "All") p.set("transaction_type", t);
    return p.toString();
  }

  /* count-up animation */
  function countUp(el, target, toStr) {
    const dur = 900;
    const t0  = performance.now();
    (function tick(now) {
      const p     = Math.min((now - t0) / dur, 1);
      const eased = 1 - Math.pow(1 - p, 3);
      el.textContent = toStr(Math.round(target * eased));
      if (p < 1) requestAnimationFrame(tick);
    })(t0);
  }

  /* trend badge */
  function renderTrend(el, value, label) {
    if (value === null || value === undefined) { el.textContent = ""; el.className = "stat-trend"; return; }
    const up = value >= 0;
    el.className = "stat-trend " + (up ? "trend-up" : "trend-down");
    el.innerHTML = `<i class="fas fa-arrow-${up ? "trending-up" : "trending-down"}"></i>
      ${up ? "+" : ""}${value}% ${label}`;
  }

  /* gradient fill for line chart */
  function makeGradient(ctx, h) {
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0,  isDark() ? "rgba(249,202,36,.18)" : "rgba(249,202,36,.22)");
    g.addColorStop(1,  "rgba(249,202,36,0)");
    return g;
  }

  /* ─────────────────────────────────────────
     DASHBOARD DATA
  ───────────────────────────────────────── */
  async function loadDashboard() {
    try {
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
      renderRecentTable(data.recentTransactions);
    } catch (e) { console.error("dashboard:", e); }
  }

  /* ─────────────────────────────────────────
     MONTHLY TRENDS
  ───────────────────────────────────────── */
  async function loadTrends() {
    try {
      const res  = await fetch(`/api/monthly-trends?${buildParams()}`);
      const data = await res.json();
      cachedTrends = data;
      renderTrendChart(data);
    } catch (e) { console.error("trends:", e); }
  }

  function renderTrendChart(data) {
    if (trendChart) trendChart.destroy();

    const canvas = document.getElementById("trendChart");
    const ctx    = canvas.getContext("2d");
    const c      = chartColors();
    const labels = { amounts: "Volume (RWF)", counts: "Transactions", fees: "Fees (RWF)" };

    trendChart = new Chart(ctx, {
      type: "line",
      data: {
        labels: data.months,
        datasets: [{
          label: labels[activeTrend],
          data:  data[activeTrend] || [],
          borderColor:     "#F9CA24",
          borderWidth:     2.5,
          backgroundColor: makeGradient(ctx, 260),
          pointBackgroundColor: "#F9CA24",
          pointBorderColor:     isDark() ? "#151929" : "#fff",
          pointBorderWidth: 2.5,
          pointRadius:      5,
          pointHoverRadius: 7,
          fill:    true,
          tension: 0.42,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: "index", intersect: false },
        plugins: {
          legend: { display: false },
          datalabels: { display: false },
          tooltip: {
            backgroundColor: c.tooltip,
            titleColor: c.text,
            bodyColor: isDark() ? "#EEF0F8" : "#fff",
            padding: 12,
            cornerRadius: 10,
            borderColor: isDark() ? "#252A40" : "transparent",
            borderWidth: 1,
            callbacks: {
              label: ctx => activeTrend === "counts"
                ? `  ${ctx.raw} transactions`
                : `  ${fmt(ctx.raw)}`
            }
          }
        },
        scales: {
          x: {
            grid:   { display: false },
            border: { display: false },
            ticks:  { color: c.text, font: { size: 12, weight: "500" } },
          },
          y: {
            grid:   { color: c.grid },
            border: { display: false },
            ticks:  {
              color: c.text,
              font:  { size: 11 },
              maxTicksLimit: 5,
              callback: v => activeTrend === "counts" ? v : fmt(v),
            }
          }
        }
      },
      plugins: [ChartDataLabels],
    });
  }

  /* ─────────────────────────────────────────
     TYPE CHART  (doughnut / bar)
  ───────────────────────────────────────── */
  function renderTypeChart(dist) {
    if (typeChart) typeChart.destroy();

    const labels = Object.keys(dist);
    const values = Object.values(dist);
    const total  = values.reduce((a, b) => a + b, 0);
    const canvas = document.getElementById("typeChart");
    const ctx    = canvas.getContext("2d");
    const c      = chartColors();
    const isDough = activeType === "doughnut";

    typeChart = new Chart(ctx, {
      type: activeType,
      data: {
        labels,
        datasets: [{
          data: values,
          backgroundColor: COLORS,
          borderColor:     isDough ? (isDark() ? "#151929" : "#fff") : COLORS,
          borderWidth:     isDough ? 2 : 0,
          borderRadius:    isDough ? 0 : 5,
          hoverOffset:     isDough ? 8 : 0,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: isDough ? "70%" : 0,
        plugins: {
          legend: {
            position: "bottom",
            labels: {
              font:      { size: 11, weight: "500" },
              color:     c.text,
              padding:   14,
              boxWidth:  10,
              boxHeight: 10,
              usePointStyle: true,
              pointStyle: "circle",
            }
          },
          datalabels: {
            display: ctx => (ctx.dataset.data[ctx.dataIndex] / total) > 0.06,
            color:   isDough ? "#fff" : "#fff",
            font:    { weight: "700", size: 11 },
            anchor:  isDough ? "center" : "end",
            align:   isDough ? "center" : "end",
            offset:  isDough ? 0 : 4,
            formatter: v => `${Math.round(v / total * 100)}%`,
          },
          tooltip: {
            backgroundColor: c.tooltip,
            titleColor:      c.text,
            bodyColor:       isDark() ? "#EEF0F8" : "#fff",
            padding:         12,
            cornerRadius:    10,
            callbacks: {
              label: ctx =>
                `  ${ctx.label}: ${ctx.raw} (${Math.round(ctx.raw / total * 100)}%)`
            }
          }
        },
        ...(isDough ? {} : {
          scales: {
            x: {
              grid:   { display: false },
              border: { display: false },
              ticks:  { color: c.text, font: { size: 10 }, maxRotation: 40 }
            },
            y: {
              grid:   { color: c.grid },
              border: { display: false },
              ticks:  { color: c.text, font: { size: 11 }, maxTicksLimit: 5 }
            }
          }
        })
      },
      /* center-text plugin for doughnut */
      plugins: [ChartDataLabels,
        ...(isDough ? [{
          id: "centerText",
          afterDraw(chart) {
            const { width, height, ctx } = chart;
            ctx.save();
            const cx = width / 2;
            const cy = height / 2 - (chart.legend.height / 2);

            ctx.font = `800 26px Inter, sans-serif`;
            ctx.fillStyle = isDark() ? "#EEF0F8" : "#1A1D2E";
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText(total, cx, cy - 10);

            ctx.font = `500 12px Inter, sans-serif`;
            ctx.fillStyle = isDark() ? "#8A90AA" : "#9DA3BC";
            ctx.fillText("transactions", cx, cy + 14);
            ctx.restore();
          }
        }] : [])
      ],
    });
  }

  /* ─────────────────────────────────────────
     ACTIVITY HEATMAP
  ───────────────────────────────────────── */
  async function loadHeatmap() {
    try {
      const res  = await fetch("/api/activity-heatmap");
      const data = await res.json();
      renderHeatmap(data);
    } catch (e) { console.error("heatmap:", e); }
  }

  function heatColor(count) {
    if (!count)    return isDark() ? "#252A40" : "#EAECF2";
    if (count < 2) return isDark() ? "#4A3800" : "#FFF0A0";
    if (count < 3) return "#F9CA24";
    if (count < 5) return "#E1A800";
    return "#B8860B";
  }

  function renderHeatmap(data) {
    const grid   = document.getElementById("heatmap-grid");
    const months = document.getElementById("heatmap-months");
    grid.innerHTML   = "";
    months.innerHTML = "";

    const dates = Object.keys(data).sort();
    if (!dates.length) return;

    const start = new Date(dates[0]);
    const end   = new Date(dates[dates.length - 1]);

    /* rewind to Monday */
    const first = new Date(start);
    first.setDate(first.getDate() - ((first.getDay() + 6) % 7));

    let cur = new Date(first);
    let col = 0;
    const monthPos = {};

    while (cur <= end) {
      const colEl = document.createElement("div");
      colEl.className = "heatmap-col";

      for (let d = 0; d < 7; d++) {
        const cell    = document.createElement("div");
        cell.className = "heatmap-cell";
        const key     = cur.toISOString().split("T")[0];
        const inRange = cur >= start && cur <= end;
        const count   = data[key] || 0;

        cell.style.background = inRange ? heatColor(count) : "transparent";

        if (inRange) {
          const dateLabel = cur.toLocaleDateString("en", { weekday:"short", year:"numeric", month:"short", day:"numeric" });
          const countLabel = count === 1 ? "1 transaction" : `${count} transactions`;

          cell.addEventListener("mouseenter", () => {
            tooltip.textContent = `${dateLabel} — ${countLabel}`;
            tooltip.classList.add("visible");
          });
          cell.addEventListener("mousemove", e => {
            tooltip.style.left = (e.clientX + 14) + "px";
            tooltip.style.top  = (e.clientY - 36) + "px";
          });
          cell.addEventListener("mouseleave", () => tooltip.classList.remove("visible"));

          /* track first occurrence of each month */
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

    /* month labels */
    const cellW = 15;
    let lastCol = -4;
    Object.entries(monthPos).forEach(([name, c]) => {
      if (c - lastCol < 3) return; // skip crowded labels
      lastCol = c;
      const lbl = document.createElement("div");
      lbl.className    = "heatmap-month-label";
      lbl.textContent  = name;
      lbl.style.width  = (cellW * 4) + "px";
      lbl.style.marginLeft = (c === 0 ? 0 : (c * cellW)) + "px";
      months.appendChild(lbl);
    });
  }

  /* ─────────────────────────────────────────
     ALL TRANSACTIONS
  ───────────────────────────────────────── */
  async function loadAllTransactions() {
    try {
      const res = await fetch("/transactions");
      allTxData = await res.json();
      renderAllTable(allTxData);
    } catch (e) { console.error("all tx:", e); }
  }

  function rowHTML(tx) {
    return `<tr>
      <td class="tx-id">${tx.transaction_id}</td>
      <td>${tx.date}</td>
      <td class="type-badge">${tx.type}</td>
      <td class="amount">${fmt(tx.amount)}</td>
      <td class="fee">${fmt(tx.fee)}</td>
    </tr>`;
  }

  function renderAllTable(rows) {
    const tbody = document.getElementById("transaction-table-body");
    const count = document.getElementById("record-count");
    count.textContent = `${rows.length} records`;
    tbody.innerHTML = rows.length
      ? rows.map(rowHTML).join("")
      : `<tr><td colspan="5" class="empty-cell">No transactions found</td></tr>`;
  }

  function renderRecentTable(rows) {
    const tbody = document.getElementById("recent-transactions-body");
    tbody.innerHTML = rows?.length
      ? rows.slice(0, 10).map(rowHTML).join("")
      : `<tr><td colspan="5" class="empty-cell">No transactions found</td></tr>`;
  }

  /* ─────────────────────────────────────────
     SCROLL SPY
  ───────────────────────────────────────── */
  function initScrollSpy() {
    const ids = ["overview","analytics","trends","activity","transactions","all-transactions"];
    const obs = new IntersectionObserver(entries => {
      entries.forEach(e => {
        if (e.isIntersecting) {
          document.querySelectorAll(".nav-link").forEach(l => l.classList.remove("active"));
          document.querySelector(`.nav-link[href="#${e.target.id}"]`)?.classList.add("active");
        }
      });
    }, { rootMargin: "-25% 0px -65% 0px" });

    ids.map(id => document.getElementById(id)).filter(Boolean).forEach(el => obs.observe(el));
  }

  /* ─────────────────────────────────────────
     EVENTS
  ───────────────────────────────────────── */

  document.getElementById("light-mode-btn").addEventListener("click", () => applyTheme(false));
  document.getElementById("dark-mode-btn").addEventListener("click",  () => applyTheme(true));

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

  applyBtn.addEventListener("click", () => { loadDashboard(); loadTrends(); });

  clearBtn.addEventListener("click", () => {
    fromDateEl.value = toDateEl.value = "";
    typeEl.value = "All";
    loadDashboard();
    loadTrends();
  });

  exportBtn.addEventListener("click", () => {
    window.location.href = `/api/export-csv?${buildParams()}`;
  });

  searchEl.addEventListener("input", () => {
    const q = searchEl.value.toLowerCase().trim();
    const filtered = q
      ? allTxData.filter(tx =>
          tx.transaction_id.toLowerCase().includes(q) ||
          tx.type.toLowerCase().includes(q) ||
          tx.date.includes(q))
      : allTxData;
    renderAllTable(filtered);
    if (q.length > 1)
      document.getElementById("all-transactions")?.scrollIntoView({ behavior: "smooth" });
  });

  /* ─────────────────────────────────────────
     INIT
  ───────────────────────────────────────── */
  loadDashboard();
  loadTrends();
  loadHeatmap();
  loadAllTransactions();
  initScrollSpy();
});
