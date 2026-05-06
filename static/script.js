document.addEventListener("DOMContentLoaded", () => {
    const fromDateEl = document.getElementById("from-date");
    const toDateEl = document.getElementById("to-date");
    const transactionTypeEl = document.getElementById("transaction-type");
    const transactionTypeChartEl = document.getElementById("transactionTypeChart");
    const recentTransactionsBody = document.getElementById("recent-transactions-body");
    const allTransactionsBody = document.getElementById("transaction-table-body");
    const chartControlButtons = document.querySelectorAll(".chart-controls button");
    const applyBtn = document.getElementById("apply-filters");
    const clearBtn = document.getElementById("clear-filters");

    let typeChartInstance = null;

    const chartColors = ["#f9ca24", "#f0932b", "#ffbe76", "#f6e58d", "#c7ecee", "#7ed6df", "#e056fd", "#686de0"];

    function formatCurrency(amount) {
        return new Intl.NumberFormat('rw-RW', {
            style: 'currency',
            currency: 'RWF',
            maximumFractionDigits: 0
        }).format(amount);
    }

    async function loadDashboardData() {
        const fromDate = fromDateEl.value;
        const toDate = toDateEl.value;
        const transactionType = transactionTypeEl.value;

        let url = '/api/dashboard-data?';
        if (fromDate) url += `from_date=${fromDate}&`;
        if (toDate) url += `to_date=${toDate}&`;
        if (transactionType && transactionType !== 'All') url += `transaction_type=${transactionType}&`;

        try {
            const response = await fetch(url);
            if (!response.ok) throw new Error(`HTTP error! Status: ${response.status}`);
            const data = await response.json();

            updateTransactionTable(data.recentTransactions);
            updateTransactionTypeChart(data.typeDistribution);
        } catch (error) {
            console.error('Error loading dashboard data:', error);
        }
    }

    function updateTransactionTable(transactions) {
        if (!transactions || transactions.length === 0) {
            recentTransactionsBody.innerHTML = '<tr><td colspan="5" class="loading-cell">No transactions found</td></tr>';
            return;
        }

        const rows = transactions.map(tx => `
            <tr>
                <!--<td>${tx.id || 'N/A'}</td>
                <td>${tx.recipient || 'N/A'}</td>
                <td>${tx.type}</td>
                <td>${formatCurrency(tx.amount)}</td>
                <td><span class="status status-completed">Completed</span></td>-->
                <td>${tx.transaction_id}</td>
                <td>${tx.date}</td>
                <!--<td>${tx.sender}</td>-->
                <!--<td>${tx.recipient}</td>-->
                <td>${tx.type}</td>
                <td>${formatCurrency(tx.amount)}</td>
                <td>${formatCurrency(tx.fee)}</td>
            </tr>
        `).join('');

        recentTransactionsBody.innerHTML = rows;
    }

    function updateTransactionTypeChart(typeDistribution) {
        const labels = Object.keys(typeDistribution);
        const values = Object.values(typeDistribution);

        if (typeChartInstance) {
            typeChartInstance.destroy();
        }

        const chartType = document.querySelector(".chart-controls button.active").dataset.type;

        typeChartInstance = new Chart(transactionTypeChartEl.getContext("2d"), {
            type: chartType,
            data: {
                labels: labels,
                datasets: [{
                    label: "Number of Transactions",
                    data: values,
                    backgroundColor: chartColors,
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                aspectRatio: 1,
                plugins: {
                    legend: {
                        position: "right"
                    },
                    datalabels: {
                        color: '#000',
                        font:{
                            weight: 'bold'
                        },
                        anchor: chartType === 'pie' ? 'center' : 'end',
                        align: chartType === 'pie' ? 'center' : 'end',
                        offset: chartType === 'pie' ? 0 : 4,
                        formatter: (value) => value
                    }
                }
            },
            plugins: [ChartDataLabels]
        });
    }

    async function loadAllTransactions() {
        try {
            const response = await fetch("/transactions");
            const data = await response.json();

            if (!data.length) {
                allTransactionsBody.innerHTML = '<tr><td colspan="6" class="loading-cell">No transactions found</td></tr>';
                return;
            }

            allTransactionsBody.innerHTML = data.map(tx => `
                <tr>
                    <td>${tx.transaction_id}</td>
                    <td>${tx.date}</td>
                    <!--<td>${tx.sender}</td>-->
                    <!--<td>${tx.recipient}</td>-->
                    <td>${tx.type}</td>
                    <td>${formatCurrency(tx.amount)}</td>
                    <td>${formatCurrency(tx.fee)}</td>
                    
                </tr>
            `).join("");
        } catch (error) {
            console.error("Error loading all transactions:", error);
        }
    }

    // Event Listeners
    chartControlButtons.forEach(button => {
        button.addEventListener("click", () => {
            chartControlButtons.forEach(btn => btn.classList.remove("active"));
            button.classList.add("active");
            loadDashboardData();
        });
    });
    
    applyBtn.addEventListener("click", loadDashboardData);

    clearBtn.addEventListener("click", () => {
        fromDateEl.value = '';
        toDateEl.value = '';
        transactionTypeEl.value = 'All';
        loadDashboardData();
    });
    // For automatic filtering
    // fromDateEl.addEventListener("change", loadDashboardData);
    // toDateEl.addEventListener("change", loadDashboardData);
    // transactionTypeEl.addEventListener("change", loadDashboardData);

    // Initial Load
    loadDashboardData();
    loadAllTransactions();
});
