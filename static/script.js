/* ─────────────────────────────────────────────
   MoMo Dashboard — script.js
───────────────────────────────────────────── */
document.addEventListener("DOMContentLoaded", () => {

  /* ── refs ── */
  const fromDateEl   = document.getElementById("from-date");
  const toDateEl     = document.getElementById("to-date");
  const typeEl       = document.getElementById("transaction-type");
  const applyBtn     = document.getElementById("apply-filters");
  const clearBtn     = document.getElementById("clear-filters");
  const exportBtn    = document.getElementById("export-csv");
  const searchEl     = document.getElementById("global-search");
  const tooltip      = document.getElementById("heatmap-tooltip");

  /* ── state ── */
  let trendChart    = null;
  let typeChart     = null;
  let activeTrend   = "amounts";
  let activeType    = "doughnut";
  let allTxData     = [];

  const CHART_COLORS = [
    "#F9CA24","#F0932B","#6AB04C","#686DE0",
    "#E056FD","#7ED6DF","#EB4D4B","#22A6B3",
    "#30336B","#130F40"
  ];

  /* ── helpers ── */
  function fmt(n) {
    return new Intl.NumberFormat("rw-RW", {
      style: "currency", currency: "RWF", maximumFractionDigits: 0
    }).format(n);
  }

  function params() {
    const p = new URLSearchParams();
    if (fromDateEl.value) p.set("from_date", fromDateEl.value);
    if (toDateEl.value)   p.set("to_date",   toDateEl.value);
    if (typeEl.value && typeEl.value !== "All") p.set("transaction_type", typeEl.value);
    return p.toString();
  }

  /* ── count-up animation ── */
  function countUp(el, target, formatter) {
    const dur = 900;
    const t0  = performance.now();
    (function tick(now) {
      const p = Math.min((now - t0) / dur, 1);
      const eased = 1 - Math.pow(1 - p, 3);
      el.textContent = formatter(Math.round(target * eased));
      if (p < 1) requestAnimationFrame(tick);
    })(t0);
  }

  /* ── trend pill ── */
  function renderTrend(el, value, label) {
    if (value === null || value === undefined) { el.textContent = ""; return; }
    const up = value >= 0;
    el.className = "stat-trend " + (up ? "trend-up" : "trend-down");
    el.innerHTML = `<i class="fas fa-arrow-${up ? "up" : "down"}"></i> ${Math.abs(value)}% ${label}`;
  }

  /* ── gradient helper for line chart ── */
  function makeGradient(ctx, h) {
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0,   "rgba(249,202,36,.35)");
    g.addColorStop(1,   "rgba(249,202,36,.0)");
    return g;
  }

  /* ───────────────────────────────────────────
     DASHBOARD DATA  (stats + recent table)
  ─────────────────────────────────────────── */
  async function loadDashboard() {
    try {
      const res  = await fetch(`/api/dashboard-data?${params()}`);
      const data = await res.json();

      /* stat cards */
      const elTx  = document.getElementById("stat-total-tx");
      const elAmt = document.getElementById("stat-total-amount");
      const elFee = document.getElementById("stat-total-fees");

      countUp(elTx,  data.totalTransactions, n => n.toLocaleString());
      countUp(elAmt, data.totalAmount,        n => fmt(n));
      countUp(elFee, data.totalFees,          n => fmt(n));
      document.getElementById("stat-top-type").textContent = data.topType || "—";

      renderTrend(document.getElementById("trend-tx"),     data.trends?.transactions, "vs last month");
      renderTrend(document.getElementById("trend-amount"), data.trends?.amount,       "vs last month");
      renderTrend(document.getElementById("trend-fees"),   data.trends?.fees,         "vs last month");

      /* type chart */
      renderTypeChart(data.typeDistribution);

      /* recent table */
      renderTable(
        document.getElementById("recent-transactions-body"),
        data.recentTransactions,
        5
      );

    } catch (e) { console.error("dashboard:", e); }
  }

  /* ───────────────────────────────────────────
     MONTHLY TRENDS  (line chart)
  ─────────────────────────────────────────── */
  async function loadTrends() {
    try {
      const res  = await fetch(`/api/monthly-trends?${params()}`);
      const data = await res.json();
      renderTrendChart(data);
    } catch (e) { console.error("trends:", e); }
  }

  function renderTrendChart(data) {
    if (trendChart) trendChart.destroy();

    const canvas = document.getElementById("trendChart");
    const ctx    = canvas.getContext("2d");

    const metricMap = { amounts: "Volume (RWF)", counts: "Transactions", fees: "Fees (RWF)" };
    const values    = data[activeTrend] || [];

    trendChart = new Chart(ctx, {
      type: "line",
      data: {
        labels: data.months,
        datasets: [{
          label: metricMap[activeTrend],
          data: values,
          borderColor: "#F9CA24",
          borderWidth: 2.5,
          backgroundColor: makeGradient(ctx, 260),
          pointBackgroundColor: "#F9CA24",
          pointBorderColor: "#fff",
          pointBorderWidth: 2,
          pointRadius: 5,
          pointHoverRadius: 7,
          fill: true,
          tension: 0.4,
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
            backgroundColor: "#1A1D2E",
            titleColor: "#9DA3BC",
            bodyColor: "#fff",
            padding: 10,
            cornerRadius: 8,
            callbacks: {
              label: ctx => {
                const v = ctx.raw;
                return activeTrend === "counts"
                  ? ` ${v} transactions`
                  : ` ${fmt(v)}`;
              }
            }
          }
        },
        scales: {
          x: {
            grid: { display: false },
            ticks: { color: "#9DA3BC", font: { size: 12 } },
            border: { display: false },
          },
          y: {
            grid: { color: "#F0F3FB", drawBorder: false },
            ticks: {
              color: "#9DA3BC",
              font: { size: 11 },
              callback: v => activeTrend === "counts" ? v : fmt(v),
              maxTicksLimit: 5,
            },
            border: { display: false },
          }
        }
      },
      plugins: [ChartDataLabels],
    });
  }

  /* ───────────────────────────────────────────
     TYPE CHART  (doughnut / bar)
  ─────────────────────────────────────────── */
  function renderTypeChart(dist) {
    if (typeChart) typeChart.destroy();

    const labels = Object.keys(dist);
    const values = Object.values(dist);
    const total  = values.reduce((a, b) => a + b, 0);

    const canvas  = document.getElementById("typeChart");
    const ctx     = canvas.getContext("2d");
    const isDough = activeType === "doughnut";

    typeChart = new Chart(ctx, {
      type: activeType,
      data: {
        labels,
        datasets: [{
          data: values,
          backgroundColor: CHART_COLORS,
          borderWidth: isDough ? 2 : 1,
          borderColor: isDough ? "#fff" : CHART_COLORS,
          borderRadius: isDough ? 0 : 4,
          hoverOffset: isDough ? 6 : 0,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: isDough ? "68%" : 0,
        plugins: {
          legend: {
            position: isDough ? "bottom" : "top",
            labels: {
              font: { size: 11 },
              color: "#5A607A",
              padding: 12,
              boxWidth: 10,
              boxHeight: 10,
            }
          },
          datalabels: isDough
            ? {
                display: true,
                color: "#fff",
                font: { weight: "bold", size: 11 },
                formatter: (v) => v > 0 ? `${Math.round(v / total * 100)}%` : "",
              }
            : {
                display: true,
                anchor: "end",
                align: "end",
                color: "#5A607A",
                font: { weight: "600", size: 11 },
                offset: 2,
                formatter: v => v,
              },
          tooltip: {
            backgroundColor: "#1A1D2E",
            titleColor: "#9DA3BC",
            bodyColor: "#fff",
            padding: 10,
            cornerRadius: 8,
            callbacks: {
              label: ctx => ` ${ctx.label}: ${ctx.raw} (${Math.round(ctx.raw / total * 100)}%)`
            }
          }
        },
        ...(isDough ? {} : {
          scales: {
            x: { grid: { display: false }, ticks: { color: "#9DA3BC", font: { size: 10 } }, border: { display: false } },
            y: { grid: { color: "#F0F3FB" }, ticks: { color: "#9DA3BC", font: { size: 11 }, maxTicksLimit: 5 }, border: { display: false } }
          }
        })
      },
      plugins: [ChartDataLabels,
        ...(isDough ? [{
          id: "centerText",
          afterDraw(chart) {
            const { width, height, ctx } = chart;
            ctx.save();
            ctx.font = `700 22px Inter, sans-serif`;
            ctx.fillStyle = "#1A1D2E";
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText(total, width / 2, height / 2 - 8);
            ctx.font = `500 11px Inter, sans-serif`;
            ctx.fillStyle = "#9DA3BC";
            ctx.fillText("transactions", width / 2, height / 2 + 14);
            ctx.restore();
          }
        }] : [])
      ],
    });
  }

  /* ───────────────────────────────────────────
     ACTIVITY HEATMAP
  ─────────────────────────────────────────── */
  async function loadHeatmap() {
    try {
      const res  = await fetch("/api/activity-heatmap");
      const data = await res.json();
      renderHeatmap(data);
    } catch (e) { console.error("heatmap:", e); }
  }

  function renderHeatmap(data) {
    const grid   = document.getElementById("heatmap-grid");
    const months = document.getElementById("heatmap-months");
    grid.innerHTML   = "";
    months.innerHTML = "";

    if (!Object.keys(data).length) return;

    /* date range from data */
    const dates = Object.keys(data).sort();
    const start = new Date(dates[0]);
    const end   = new Date(dates[dates.length - 1]);

    /* rewind to Monday */
    const first = new Date(start);
    const dow   = first.getDay();           // 0=Sun
    first.setDate(first.getDate() - ((dow + 6) % 7));  // go back to Mon

    function cellColor(count) {
      if (!count)   return "#EAECF2";
      if (count < 2) return "#FFF0A0";
      if (count < 3) return "#F9CA24";
      if (count < 5) return "#E1A800";
      return "#B8860B";
    }

    let cur       = new Date(first);
    let weekCols  = 0;
    const monthPositions = {};

    while (cur <= end) {
      const col = document.createElement("div");
      col.className = "heatmap-col";

      for (let d = 0; d < 7; d++) {
        const cell     = document.createElement("div");
        cell.className = "heatmap-cell";
        const key      = cur.toISOString().split("T")[0];
        const inRange  = cur >= start && cur <= end;
        const count    = data[key] || 0;

        cell.style.background = inRange ? cellColor(count) : "transparent";

        if (inRange) {
          cell.addEventListener("mouseenter", e => {
            const label = count === 1 ? "1 transaction" : `${count} transactions`;
            tooltip.textContent = `${key}  —  ${label}`;
            tooltip.classList.add("visible");
          });
          cell.addEventListener("mousemove", e => {
            tooltip.style.left = (e.clientX + 12) + "px";
            tooltip.style.top  = (e.clientY - 28) + "px";
          });
          cell.addEventListener("mouseleave", () => tooltip.classList.remove("visible"));
        }

        /* track month label position */
        if (d === 0 && inRange) {
          const mn = cur.toLocaleDateString("en", { month: "short" });
          if (cur.getDate() <= 7 && !monthPositions[mn]) {
            monthPositions[mn] = weekCols;
          }
        }

        col.appendChild(cell);
        cur.setDate(cur.getDate() + 1);
      }

      grid.appendChild(col);
      weekCols++;
    }

    /* render month labels */
    const cellW = 15; // 12px + 3px gap
    Object.entries(monthPositions).forEach(([name, col]) => {
      const lbl = document.createElement("div");
      lbl.className = "heatmap-month-label";
      lbl.style.width       = "0";
      lbl.style.marginLeft  = (col * cellW) + "px";
      lbl.style.paddingLeft = "0";
      lbl.textContent = name;
      months.appendChild(lbl);
    });
  }

  /* ───────────────────────────────────────────
     ALL TRANSACTIONS  (with client search)
  ─────────────────────────────────────────── */
  async function loadAllTransactions() {
    try {
      const res  = await fetch("/transactions");
      allTxData  = await res.json();
      renderAllTable(allTxData);
    } catch (e) { console.error("all tx:", e); }
  }

  function renderAllTable(rows) {
    const tbody = document.getElementById("transaction-table-body");
    const count = document.getElementById("record-count");
    count.textContent = `${rows.length} records`;

    if (!rows.length) {
      tbody.innerHTML = `<tr><td colspan="5" class="empty-cell">No transactions found</td></tr>`;
      return;
    }
    tbody.innerHTML = rows.map(tx => `
      <tr>
        <td class="tx-id">${tx.transaction_id}</td>
        <td>${tx.date}</td>
        <td><span class="type-badge">${tx.type}</span></td>
        <td class="amount">${fmt(tx.amount)}</td>
        <td class="fee">${fmt(tx.fee)}</td>
      </tr>
    `).join("");
  }

  /* ── shared recent table renderer ── */
  function renderTable(tbody, rows, limit) {
    if (!rows || !rows.length) {
      tbody.innerHTML = `<tr><td colspan="5" class="empty-cell">No transactions found</td></tr>`;
      return;
    }
    const slice = limit ? rows.slice(0, limit) : rows;
    tbody.innerHTML = slice.map(tx => `
      <tr>
        <td class="tx-id">${tx.transaction_id}</td>
        <td>${tx.date}</td>
        <td><span class="type-badge">${tx.type}</span></td>
        <td class="amount">${fmt(tx.amount)}</td>
        <td class="fee">${fmt(tx.fee)}</td>
      </tr>
    `).join("");
  }

  /* ───────────────────────────────────────────
     SIDEBAR  active-on-scroll
  ─────────────────────────────────────────── */
  function initScrollSpy() {
    const sections = ["overview","analytics","trends","activity","transactions","all-transactions"]
      .map(id => document.getElementById(id))
      .filter(Boolean);

    const links = document.querySelectorAll(".nav-link");

    const obs = new IntersectionObserver(entries => {
      entries.forEach(e => {
        if (e.isIntersecting) {
          links.forEach(l => l.classList.remove("active"));
          const active = document.querySelector(`.nav-link[href="#${e.target.id}"]`);
          if (active) active.classList.add("active");
        }
      });
    }, { rootMargin: "-30% 0px -60% 0px" });

    sections.forEach(s => obs.observe(s));
  }

  /* ───────────────────────────────────────────
     EVENTS
  ─────────────────────────────────────────── */

  /* trend metric tabs */
  document.querySelectorAll("#trend-tabs .pill").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll("#trend-tabs .pill").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      activeTrend = btn.dataset.metric;
      loadTrends();
    });
  });

  /* type chart tabs */
  document.querySelectorAll("#type-tabs .pill").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll("#type-tabs .pill").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      activeType = btn.dataset.type;
      loadDashboard();
    });
  });

  applyBtn.addEventListener("click", () => { loadDashboard(); loadTrends(); });

  clearBtn.addEventListener("click", () => {
    fromDateEl.value = "";
    toDateEl.value   = "";
    typeEl.value     = "All";
    loadDashboard();
    loadTrends();
  });

  exportBtn.addEventListener("click", () => {
    window.location.href = `/api/export-csv?${params()}`;
  });

  /* global search → filters all-transactions table */
  searchEl.addEventListener("input", () => {
    const q = searchEl.value.toLowerCase().trim();
    if (!q) { renderAllTable(allTxData); return; }
    const filtered = allTxData.filter(tx =>
      tx.transaction_id.toLowerCase().includes(q) ||
      tx.type.toLowerCase().includes(q) ||
      tx.date.includes(q)
    );
    renderAllTable(filtered);

    /* scroll to all-transactions */
    if (q.length > 1) {
      document.getElementById("all-transactions")?.scrollIntoView({ behavior: "smooth" });
    }
  });

  /* appearance toggle (just UI — no actual dark mode) */
  document.getElementById("light-mode-btn")?.addEventListener("click", function() {
    this.classList.add("active");
    document.getElementById("dark-mode-btn")?.classList.remove("active");
  });
  document.getElementById("dark-mode-btn")?.addEventListener("click", function() {
    this.classList.add("active");
    document.getElementById("light-mode-btn")?.classList.remove("active");
  });

  /* ───────────────────────────────────────────
     INIT
  ─────────────────────────────────────────── */
  loadDashboard();
  loadTrends();
  loadHeatmap();
  loadAllTransactions();
  initScrollSpy();
});
