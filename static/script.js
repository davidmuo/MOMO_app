document.addEventListener("DOMContentLoaded", () => {
    const fromDateEl = document.getElementById("from-date");
    const toDateEl = document.getElementById("to-date");
    const transactionTypeEl = document.getElementById("transaction-type");
    const applyBtn = document.getElementById("apply-filters");
    const clearBtn = document.getElementById("clear-filters");
    const exportBtn = document.getElementById("export-csv");

    const chartColors = ["#f9ca24", "#f0932b", "#ffbe76", "#f6e58d", "#c7ecee", "#7ed6df", "#e056fd", "#686de0", "#6ab04c", "#eb4d4b"];

    let typeChartInstance = null;
    let trendChartInstance = null;
    let activeTrendMetric = "amounts";

    function formatCurrency(amount) {
        return new Intl.NumberFormat("rw-RW", {
            style: "currency",
            currency: "RWF",
            maximumFractionDigits: 0,
        }).format(amount);
    }

    function buildFilterParams() {
        const params = new URLSearchParams();
        if (fromDateEl.value) params.set("from_date", fromDateEl.value);
        if (toDateEl.value) params.set("to_date", toDateEl.value);
        if (transactionTypeEl.value && transactionTypeEl.value !== "All")
            params.set("transaction_type", transactionTypeEl.value);
        return params.toString();
    }

    async function loadDashboardData() {
        try {
            const res = await fetch(`/api/dashboard-data?${buildFilterParams()}`);
            if (!res.ok) throw new Error(res.status);
            const data = await res.json();
            updateStats(data);
            updateTypeChart(data.typeDistribution);
            updateRecentTable(data.recentTransactions);
        } catch (err) {
            console.error("Dashboard load error:", err);
        }
    }

    async function loadTrends() {
        try {
            const res = await fetch(`/api/monthly-trends?${buildFilterParams()}`);
            if (!res.ok) throw new Error(res.status);
            const data = await res.json();
            updateTrendChart(data);
        } catch (err) {
            console.error("Trends load error:", err);
        }
    }

    async function loadAllTransactions() {
        try {
            const res = await fetch("/transactions");
            const data = await res.json();
            const tbody = document.getElementById("transaction-table-body");
            if (!data.length) {
                tbody.innerHTML = '<tr><td colspan="5" class="loading-cell">No transactions found</td></tr>';
                return;
            }
            tbody.innerHTML = data.map(tx => `
                <tr>
                    <td>${tx.transaction_id}</td>
                    <td>${tx.date}</td>
                    <td><span class="type-badge">${tx.type}</span></td>
                    <td class="amount">${formatCurrency(tx.amount)}</td>
                    <td class="fee">${formatCurrency(tx.fee)}</td>
                </tr>
            `).join("");
        } catch (err) {
            console.error("All transactions load error:", err);
        }
    }

    function updateStats(data) {
        document.getElementById("stat-total-tx").textContent = data.totalTransactions.toLocaleString();
        document.getElementById("stat-total-amount").textContent = formatCurrency(data.totalAmount);
        document.getElementById("stat-total-fees").textContent = formatCurrency(data.totalFees);
        document.getElementById("stat-top-type").textContent = data.topType || "N/A";
    }

    function updateRecentTable(transactions) {
        const tbody = document.getElementById("recent-transactions-body");
        if (!transactions || !transactions.length) {
            tbody.innerHTML = '<tr><td colspan="5" class="loading-cell">No transactions found</td></tr>';
            return;
        }
        tbody.innerHTML = transactions.map(tx => `
            <tr>
                <td>${tx.transaction_id}</td>
                <td>${tx.date}</td>
                <td><span class="type-badge">${tx.type}</span></td>
                <td class="amount">${formatCurrency(tx.amount)}</td>
                <td class="fee">${formatCurrency(tx.fee)}</td>
            </tr>
        `).join("");
    }

    function updateTypeChart(typeDistribution) {
        const labels = Object.keys(typeDistribution);
        const values = Object.values(typeDistribution);
        const chartType = document.querySelector(".chart-controls button.active")?.dataset.type || "bar";

        if (typeChartInstance) typeChartInstance.destroy();

        typeChartInstance = new Chart(
            document.getElementById("transactionTypeChart").getContext("2d"),
            {
                type: chartType,
                data: {
                    labels,
                    datasets: [{
                        label: "Transactions",
                        data: values,
                        backgroundColor: chartColors,
                        borderWidth: 1,
                    }],
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: { position: chartType === "pie" ? "right" : "top" },
                        datalabels: {
                            color: "#000",
                            font: { weight: "bold" },
                            anchor: chartType === "pie" ? "center" : "end",
                            align: chartType === "pie" ? "center" : "end",
                            offset: chartType === "pie" ? 0 : 4,
                            formatter: v => v,
                        },
                    },
                },
                plugins: [ChartDataLabels],
            }
        );
    }

    function updateTrendChart(data) {
        if (trendChartInstance) trendChartInstance.destroy();

        const metricLabels = { amounts: "Volume (RWF)", counts: "# Transactions", fees: "Fees (RWF)" };
        const values = data[activeTrendMetric] || [];

        trendChartInstance = new Chart(
            document.getElementById("trendChart").getContext("2d"),
            {
                type: "line",
                data: {
                    labels: data.months,
                    datasets: [{
                        label: metricLabels[activeTrendMetric],
                        data: values,
                        borderColor: "#f0932b",
                        backgroundColor: "rgba(249,202,36,0.15)",
                        borderWidth: 2,
                        pointBackgroundColor: "#f9ca24",
                        pointRadius: 5,
                        fill: true,
                        tension: 0.3,
                    }],
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: { display: false },
                        datalabels: { display: false },
                    },
                    scales: {
                        y: {
                            beginAtZero: true,
                            ticks: {
                                callback: v => activeTrendMetric === "counts" ? v : formatCurrency(v),
                            },
                        },
                    },
                },
                plugins: [ChartDataLabels],
            }
        );
    }

    function refreshAll() {
        loadDashboardData();
        loadTrends();
    }

    // Type chart toggle (Bar / Pie)
    document.querySelectorAll(".chart-controls button[data-type]").forEach(btn => {
        btn.addEventListener("click", () => {
            document.querySelectorAll(".chart-controls button[data-type]").forEach(b => b.classList.remove("active"));
            btn.classList.add("active");
            loadDashboardData();
        });
    });

    // Trend metric toggle (Volume / Count / Fees)
    document.querySelectorAll(".chart-controls button[data-metric]").forEach(btn => {
        btn.addEventListener("click", () => {
            document.querySelectorAll(".chart-controls button[data-metric]").forEach(b => b.classList.remove("active"));
            btn.classList.add("active");
            activeTrendMetric = btn.dataset.metric;
            loadTrends();
        });
    });

    applyBtn.addEventListener("click", refreshAll);

    clearBtn.addEventListener("click", () => {
        fromDateEl.value = "";
        toDateEl.value = "";
        transactionTypeEl.value = "All";
        refreshAll();
    });

    exportBtn.addEventListener("click", () => {
        window.location.href = `/api/export-csv?${buildFilterParams()}`;
    });

    // Initial load
    refreshAll();
    loadAllTransactions();
});
