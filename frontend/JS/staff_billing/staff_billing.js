import { products } from "./data/staff_billing_data.js";

let cart = [];
const HISTORY_STORAGE_KEY = "ibms_billing_history";

export function initBilling() {
  const productList = document.getElementById("productList");
  const cartItems = document.getElementById("cartItems");
  const cartCount = document.getElementById("cartCount");
  const totalEl = document.getElementById("total");
  const subtotalEl = document.getElementById("subtotal");
  const clearCartBtn = document.getElementById("clearCart");
  const proceedPaymentBtn = document.getElementById("proceedPayment");
  const searchInput = document.getElementById("searchProduct");
  const filterCategory = document.getElementById("filterCategory");

  const tabTransactionsBtn = document.getElementById("tabTransactions");
  const tabHistoryBtn = document.getElementById("tabHistory");
  const transactionsSection = document.getElementById("transactionsSection");
  const paymentSection = document.getElementById("paymentSection");
  const paymentSuccessSection = document.getElementById("paymentSuccessSection");
  const historySection = document.getElementById("historySection");
  const tabButtons = document.getElementById("tabButtons");

  const searchHistoryInput = document.getElementById("searchHistory");
  const filterTodayBtn = document.getElementById("filterToday");
  const historyTable = document.getElementById("historyTable");
  const historyTransactionsToday = document.getElementById("historyTransactionsToday");
  const historyTotalSales = document.getElementById("historyTotalSales");

  const patientIdInput = document.getElementById("patientId");
  const patientNameInput = document.getElementById("patientName");

  if (!productList || !cartItems) return;

  let filteredProducts = products;
  let historyRecords = loadBillingHistory();
  let historyTodayOnly = false;

  const cashReceivedInput = document.getElementById("cashReceived");
  const changeAmountEl = document.getElementById("changeAmount");
  const completePaymentBtn = document.getElementById("completePayment");
  const payAmountEl = document.getElementById("payAmount");
  const quickAmountBtns = document.querySelectorAll(".quick-amount");

  function formatCurrency(amount) {
    return `₱${(Number(amount) || 0).toFixed(2)}`;
  }

  function getDateTimeDisplay(record) {
    if (record.dateTimeDisplay) return record.dateTimeDisplay;
    if (!record.dateTime) return "-";
    return new Date(record.dateTime).toLocaleString();
  }

  function isTodayDate(dateString) {
    if (!dateString) return false;
    const date = new Date(dateString);
    const now = new Date();
    return date.getFullYear() === now.getFullYear() &&
      date.getMonth() === now.getMonth() &&
      date.getDate() === now.getDate();
  }

  function setHistoryTabStyles(isHistoryActive) {
    if (!tabTransactionsBtn || !tabHistoryBtn) return;

    if (isHistoryActive) {
      tabHistoryBtn.classList.remove("bg-gray-200", "text-gray-700");
      tabHistoryBtn.classList.add("bg-emerald-700", "text-white");
      tabTransactionsBtn.classList.remove("bg-emerald-700", "text-white");
      tabTransactionsBtn.classList.add("bg-gray-200", "text-gray-700");
      return;
    }

    tabTransactionsBtn.classList.remove("bg-gray-200", "text-gray-700");
    tabTransactionsBtn.classList.add("bg-emerald-700", "text-white");
    tabHistoryBtn.classList.remove("bg-emerald-700", "text-white");
    tabHistoryBtn.classList.add("bg-gray-200", "text-gray-700");
  }

  function showTransactionsTab() {
    transactionsSection?.classList.remove("hidden");
    paymentSection?.classList.add("hidden");
    paymentSuccessSection?.classList.add("hidden");
    historySection?.classList.add("hidden");
    if (tabButtons) tabButtons.style.display = "";
    setHistoryTabStyles(false);
  }

  function showHistoryTab() {
    transactionsSection?.classList.add("hidden");
    paymentSection?.classList.add("hidden");
    paymentSuccessSection?.classList.add("hidden");
    historySection?.classList.remove("hidden");
    if (tabButtons) tabButtons.style.display = "";
    setHistoryTabStyles(true);
    renderHistoryTable();
  }

  function updateChange() {
    const payAmount = parseFloat(payAmountEl?.textContent?.replace(/[₱,]/g, "") || "0");
    const cash = parseFloat(cashReceivedInput?.value || "0");
    const change = cash - payAmount;
    if (changeAmountEl) changeAmountEl.textContent = `₱${change > 0 ? change.toFixed(2) : "0.00"}`;
    if (completePaymentBtn) completePaymentBtn.disabled = !(cash >= payAmount && payAmount > 0);
  }

  function renderProducts() {
    productList.innerHTML = "";
    filteredProducts.forEach(product => {
      const card = document.createElement("div");
      card.className = "border rounded-lg p-4 space-y-1 bg-white";
      card.innerHTML = `
        <h3 class="font-semibold">${product.name}</h3>
        <p class="text-xs text-gray-500">${product.id} · ${product.category}</p>
        <p class="text-lg font-bold text-emerald-700">₱${product.price.toFixed(2)}</p>
        <p class="text-xs text-gray-500">Stock: ${product.stock}</p>
        <button class="mt-2 w-full bg-emerald-700 text-white py-1 rounded text-sm">Add</button>
      `;
      card.querySelector("button")?.addEventListener("click", () => addToCart(product));
      productList.appendChild(card);
    });
  }

  function filterProducts() {
    const search = searchInput?.value?.toLowerCase() || "";
    const category = filterCategory?.value || "";

    filteredProducts = products.filter(product => {
      const matchesSearch = product.name.toLowerCase().includes(search) || product.id.toLowerCase().includes(search);
      const matchesCategory = !category || product.category === category;
      return matchesSearch && matchesCategory;
    });

    renderProducts();
  }

  function addToCart(product) {
    const existing = cart.find(item => item.id === product.id);
    if (existing) existing.qty += 1;
    else cart.push({ ...product, qty: 1 });
    renderCart();
  }

  function setQty(id, value) {
    const item = cart.find(entry => entry.id === id);
    if (!item) return;

    const qty = Number(value);
    if (qty <= 0 || Number.isNaN(qty)) {
      cart = cart.filter(entry => entry.id !== id);
    } else {
      item.qty = qty;
    }

    renderCart();
  }

  function updateQty(id, delta) {
    const item = cart.find(entry => entry.id === id);
    if (!item) return;
    item.qty += delta;
    if (item.qty <= 0) cart = cart.filter(entry => entry.id !== id);
    renderCart();
  }

  function clearCart() {
    cart = [];
    renderCart();
  }

  function renderCart() {
    cartItems.innerHTML = "";
    cartCount.textContent = String(cart.reduce((sum, item) => sum + item.qty, 0));

    let subtotal = 0;
    let total = 0;

    if (cart.length === 0) {
      cartItems.innerHTML = `
        <div class="text-center text-gray-400 mt-20">
          Cart is empty<br>
          <span class="text-xs">Add a product to start</span>
        </div>
      `;
      totalEl.textContent = "₱0.00";
      subtotalEl.textContent = "₱0.00";
      proceedPaymentBtn.disabled = true;
      return;
    }

    cart.forEach(item => {
      subtotal += item.price * item.qty;
      total += item.price * item.qty;

      const row = document.createElement("div");
      row.className = "flex justify-between items-center border-b pb-2 mb-2";
      row.innerHTML = `
        <div>
          <p class="font-medium">${item.name}</p>
          <p class="text-xs text-gray-500">₱${item.price.toFixed(2)} each</p>
        </div>
        <div class="flex flex-col items-end">
          <div class="flex items-center gap-2 mb-1">
            <button class="px-2 border rounded" title="Decrease">−</button>
            <input type="number" min="1" value="${item.qty}" class="w-14 text-center border rounded text-sm" />
            <button class="px-2 border rounded" title="Increase">+</button>
          </div>
          <span class="font-semibold">₱${(item.price * item.qty).toFixed(2)}</span>
          <button class="text-red-500 text-xs mt-1" title="Remove">🗑</button>
        </div>
      `;

      const [minusBtn, qtyInput, plusBtn] = row.querySelectorAll("button, input");
      minusBtn.onclick = () => updateQty(item.id, -1);
      plusBtn.onclick = () => updateQty(item.id, 1);
      qtyInput.onblur = event => setQty(item.id, event.target.value);
      qtyInput.onkeydown = event => {
        if (event.key === "Enter") {
          setQty(item.id, event.target.value);
          qtyInput.blur();
        }
      };
      row.querySelector(".text-red-500").onclick = () => setQty(item.id, 0);
      cartItems.appendChild(row);
    });

    totalEl.textContent = `₱${total.toFixed(2)}`;
    subtotalEl.textContent = `₱${subtotal.toFixed(2)}`;
    proceedPaymentBtn.disabled = cart.length === 0;
  }

  function getFilteredHistoryRecords() {
    const keyword = (searchHistoryInput?.value || "").trim().toLowerCase();

    return historyRecords.filter(record => {
      const matchesToday = !historyTodayOnly || isTodayDate(record.dateTime);
      if (!keyword) return matchesToday;

      const haystack = [record.id, record.patientId, record.patientName].join(" ").toLowerCase();
      return matchesToday && haystack.includes(keyword);
    });
  }

  function updateHistorySummary() {
    const todayRecords = historyRecords.filter(record => isTodayDate(record.dateTime));
    const totalSalesToday = todayRecords.reduce((sum, record) => sum + (Number(record.total) || 0), 0);

    if (historyTransactionsToday) historyTransactionsToday.textContent = String(todayRecords.length);
    if (historyTotalSales) historyTotalSales.textContent = formatCurrency(totalSalesToday);
  }

  function openTransactionDetails(transactionId) {
    const tx = historyRecords.find(record => record.id === transactionId);
    if (!tx) return;

    const dateObj = tx.dateTime ? new Date(tx.dateTime) : null;
    const detailsItems = document.getElementById("detailsItems");

    document.getElementById("detailsTransactionId").textContent = tx.id || "-";
    document.getElementById("detailsStatus").textContent = tx.status || "Completed";
    document.getElementById("detailsDate").textContent = dateObj ? dateObj.toLocaleDateString() : "-";
    document.getElementById("detailsTime").textContent = dateObj ? dateObj.toLocaleTimeString() : "-";
    document.getElementById("detailsPatient").textContent = `${tx.patientName || "Walk-in"} (${tx.patientId || "SAMPLE-XXX"})`;

    if (detailsItems) {
      detailsItems.innerHTML = (tx.items || []).map(item => `
        <tr>
          <td class="py-1">${item.name}</td>
          <td class="text-center">${item.qty}</td>
          <td class="text-right">${formatCurrency(item.lineTotal)}</td>
        </tr>
      `).join("");
    }

    document.getElementById("detailsTotal").textContent = formatCurrency(tx.total);
    document.getElementById("detailsCashPaid").textContent = formatCurrency(tx.cashPaid);
    document.getElementById("detailsChange").textContent = formatCurrency(tx.change);

    document.getElementById("transactionDetailsModal")?.classList.remove("hidden");
  }

  function closeTransactionDetails() {
    document.getElementById("transactionDetailsModal")?.classList.add("hidden");
  }

  function renderHistoryTable() {
    if (!historyTable) return;

    const filteredHistory = getFilteredHistoryRecords();
    updateHistorySummary();

    if (filteredHistory.length === 0) {
      historyTable.innerHTML = `
        <tr>
          <td colspan="6" class="py-8 text-center text-gray-500">No transactions found.</td>
        </tr>
      `;
      return;
    }

    historyTable.innerHTML = filteredHistory.map(record => {
      const itemCount = (record.items || []).reduce((sum, item) => sum + (item.qty || 0), 0);
      return `
        <tr class="border-b">
          <td class="py-2">${record.id}</td>
          <td class="py-2">${getDateTimeDisplay(record)}</td>
          <td class="py-2">${itemCount} item(s)</td>
          <td class="py-2">${record.patientId || "SAMPLE-XXX"}</td>
          <td class="py-2">${formatCurrency(record.total)}</td>
          <td class="py-2 text-center">
            <button class="history-view-btn border rounded px-3 py-1 text-xs hover:bg-gray-100" data-id="${record.id}">View</button>
          </td>
        </tr>
      `;
    }).join("");

    historyTable.querySelectorAll(".history-view-btn").forEach(button => {
      button.addEventListener("click", () => openTransactionDetails(button.dataset.id));
    });
  }

  searchInput?.addEventListener("input", filterProducts);
  filterCategory?.addEventListener("change", filterProducts);
  clearCartBtn?.addEventListener("click", clearCart);

  cashReceivedInput?.addEventListener("input", updateChange);
  quickAmountBtns.forEach(button => {
    button.addEventListener("click", () => {
      const payAmount = parseFloat(payAmountEl?.textContent?.replace(/[₱,]/g, "") || "0");
      const amount = button.dataset.amount === "exact" ? payAmount : button.dataset.amount;
      if (cashReceivedInput) cashReceivedInput.value = amount;
      updateChange();
    });
  });

  proceedPaymentBtn?.addEventListener("click", () => {
    if (cart.length === 0) return;

    transactionsSection?.classList.add("hidden");
    paymentSection?.classList.remove("hidden");
    if (tabButtons) tabButtons.style.display = "none";

    const now = new Date();
    const transactionId = generateTransactionId();
    const total = cart.reduce((sum, item) => sum + item.price * item.qty, 0);
    const totalItems = cart.reduce((sum, item) => sum + item.qty, 0);

    document.getElementById("summaryTransactionId").textContent = transactionId;
    document.getElementById("summaryItems").textContent = `${totalItems} item(s)`;
    document.getElementById("summaryDateTime").textContent = now.toLocaleString();
    document.getElementById("summaryTotal").textContent = formatCurrency(total);
    document.getElementById("payAmount").textContent = formatCurrency(total);
    document.getElementById("quickExact").textContent = total.toFixed(2);

    const itemsList = document.getElementById("summaryItemsList");
    if (itemsList) {
      itemsList.innerHTML = cart.map(item => `
        <div class="flex justify-between border-b pb-2 mb-2">
          <span>${item.name} <span class="text-xs text-gray-400">x${item.qty}</span></span>
          <span>${formatCurrency(item.price * item.qty)}</span>
        </div>
      `).join("");
    }

    if (cashReceivedInput) cashReceivedInput.value = "";
    if (changeAmountEl) changeAmountEl.textContent = "₱0.00";
    if (completePaymentBtn) completePaymentBtn.disabled = true;
  });

  document.getElementById("backToTransactions")?.addEventListener("click", showTransactionsTab);
  document.getElementById("cancelTransaction")?.addEventListener("click", showTransactionsTab);

  document.getElementById("cancelPayment")?.addEventListener("click", () => {
    clearCart();
    if (patientIdInput) patientIdInput.value = "";
    if (patientNameInput) patientNameInput.value = "";
  });

  completePaymentBtn?.addEventListener("click", () => {
    paymentSection?.classList.add("hidden");
    paymentSuccessSection?.classList.remove("hidden");
    if (tabButtons) tabButtons.style.display = "none";

    const transactionId = document.getElementById("summaryTransactionId")?.textContent || generateTransactionId();
    const summaryDateTime = document.getElementById("summaryDateTime")?.textContent || new Date().toLocaleString();
    const patientId = patientIdInput?.value?.trim() || "SAMPLE-XXX";
    const patientName = patientNameInput?.value?.trim() || "Walk-in";
    const total = cart.reduce((sum, item) => sum + item.price * item.qty, 0);
    const cashPaid = parseFloat(cashReceivedInput?.value || "0");
    const change = Math.max(cashPaid - total, 0);

    document.getElementById("receiptTransactionId").textContent = transactionId;
    document.getElementById("receiptDateTime").textContent = summaryDateTime;
    document.getElementById("receiptPatient").textContent = `${patientName} (${patientId})`;
    document.getElementById("receiptStaff").textContent = "Staff Name";
    document.getElementById("receiptTotal").textContent = formatCurrency(total);
    document.getElementById("receiptCashPaid").textContent = formatCurrency(cashPaid);
    document.getElementById("receiptChange").textContent = formatCurrency(change);

    const receiptItems = document.getElementById("receiptItems");
    if (receiptItems) {
      receiptItems.innerHTML = cart.map(item => `
        <tr>
          <td>${item.name}</td>
          <td class="text-center">${item.qty}</td>
          <td class="text-right">${formatCurrency(item.price * item.qty)}</td>
        </tr>
      `).join("");
    }

    const completedTx = {
      id: transactionId,
      dateTime: new Date().toISOString(),
      dateTimeDisplay: summaryDateTime,
      patientId,
      patientName,
      total,
      cashPaid,
      change,
      status: "Completed",
      items: cart.map(item => ({
        id: item.id,
        name: item.name,
        qty: item.qty,
        price: item.price,
        lineTotal: item.price * item.qty
      }))
    };

    historyRecords = [completedTx, ...historyRecords];
    saveBillingHistory(historyRecords);
    renderHistoryTable();

    cart = [];
    renderCart();
  });

  document.getElementById("newTransaction")?.addEventListener("click", () => {
    showTransactionsTab();
    clearCart();
    if (patientIdInput) patientIdInput.value = "";
    if (patientNameInput) patientNameInput.value = "";
  });

  document.getElementById("returnToTransactions")?.addEventListener("click", () => {
    showTransactionsTab();
    clearCart();
    if (patientIdInput) patientIdInput.value = "";
    if (patientNameInput) patientNameInput.value = "";
  });

  tabTransactionsBtn?.addEventListener("click", showTransactionsTab);
  tabHistoryBtn?.addEventListener("click", showHistoryTab);

  searchHistoryInput?.addEventListener("input", renderHistoryTable);
  filterTodayBtn?.addEventListener("click", () => {
    historyTodayOnly = !historyTodayOnly;
    if (historyTodayOnly) {
      filterTodayBtn.classList.add("bg-emerald-700", "text-white", "border-emerald-700");
    } else {
      filterTodayBtn.classList.remove("bg-emerald-700", "text-white", "border-emerald-700");
    }
    renderHistoryTable();
  });

  document.getElementById("closeTransactionDetails")?.addEventListener("click", closeTransactionDetails);
  document.getElementById("closeDetails")?.addEventListener("click", closeTransactionDetails);
  document.getElementById("transactionDetailsModal")?.addEventListener("click", event => {
    if (event.target.id === "transactionDetailsModal") closeTransactionDetails();
  });

  document.getElementById("printDetailsReceipt")?.addEventListener("click", () => window.print());
  document.getElementById("printReceipt")?.addEventListener("click", () => window.print());

  renderProducts();
  renderCart();
  renderHistoryTable();
  showTransactionsTab();
}

function generateTransactionId() {
  const now = new Date();
  const datePart = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;
  const randomPart = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `OR-${datePart}-${randomPart}`;
}

function loadBillingHistory() {
  try {
    const raw = localStorage.getItem(HISTORY_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveBillingHistory(records) {
  localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(records));
}