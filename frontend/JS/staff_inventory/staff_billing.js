import { products } from "./data/staff_billing_data.js";

let cart = [];

/* ================= INIT ================= */
export function initBilling() {
  console.log("=== INIT BILLING STARTED ===");

  const productList = document.getElementById("productList");
  const cartItems = document.getElementById("cartItems");
  const cartCount = document.getElementById("cartCount");
  const totalEl = document.getElementById("total");
  const subtotalEl = document.getElementById("subtotal");
  const clearCartBtn = document.getElementById("clearCart");
  const proceedPaymentBtn = document.getElementById("proceedPayment");
  const searchInput = document.getElementById("searchProduct");
  const filterCategory = document.getElementById("filterCategory");

  console.log("DOM Elements found:", {
    productList: !!productList,
    cartItems: !!cartItems,
    cartCount: !!cartCount,
    totalEl: !!totalEl,
    subtotalEl: !!subtotalEl,
    clearCartBtn: !!clearCartBtn,
    proceedPaymentBtn: !!proceedPaymentBtn,
    searchInput: !!searchInput,
    filterCategory: !!filterCategory
  });

  if (!productList || !cartItems) {
    console.error("CRITICAL: Billing DOM not ready", { productList, cartItems });
    console.error("Available elements:", document.querySelectorAll("[id]").length);
    console.log("All IDs on page:", Array.from(document.querySelectorAll("[id]")).map(el => el.id));
    return;
  }

  console.log("Billing initialized successfully");
  console.log("Products loaded:", products.length, "items");
  console.log("paymentModal:", document.getElementById("paymentModal"));
  console.log("transactionsSection:", document.getElementById("transactionsSection"));

  let filteredProducts = products;

  function renderProducts() {
    productList.innerHTML = "";
    filteredProducts.forEach(product => {
      const card = document.createElement("div");
      card.className = "border rounded-lg p-4 space-y-1 bg-white";
      card.innerHTML = `
        <h3 class="font-semibold">${product.name}</h3>
        <p class="text-xs text-gray-500">${product.id} · ${product.category}</p>
        <p class="text-lg font-bold text-emerald-700">
          ₱${product.price.toFixed(2)}
        </p>
        <p class="text-xs text-gray-500">Stock: ${product.stock}</p>
        <button class="mt-2 w-full bg-emerald-700 text-white py-1 rounded text-sm">
          Add
        </button>
      `;
      card.querySelector("button")
        .addEventListener("click", () => addToCart(product));
      productList.appendChild(card);
    });
  }

  function filterProducts() {
    const search = searchInput?.value?.toLowerCase() || "";
    const category = filterCategory?.value || "";
    filteredProducts = products.filter(p => {
      const matchesSearch =
        p.name.toLowerCase().includes(search) ||
        p.id.toLowerCase().includes(search);
      const matchesCategory = !category || p.category === category;
      return matchesSearch && matchesCategory;
    });
    renderProducts();
  }

  searchInput?.addEventListener("input", filterProducts);
  filterCategory?.addEventListener("change", filterProducts);

  console.log("Rendering products...");
  renderProducts();
  
  console.log("Rendering cart...");
  renderCart();

  /* ================= PAYMENT MODAL SETUP ================= */
  const cashReceivedInput = document.getElementById("cashReceived");
  const changeAmountEl = document.getElementById("changeAmount");
  const completePaymentBtn = document.getElementById("completePayment");
  const payAmountEl = document.getElementById("payAmount");
  const quickAmountBtns = document.querySelectorAll(".quick-amount");

  console.log("Payment modal elements:", {
    cashReceivedInput,
    changeAmountEl,
    completePaymentBtn,
    payAmountEl,
    quickAmountBtnsCount: quickAmountBtns.length
  });

  function updateChange() {
    const payAmount = parseFloat(payAmountEl.textContent.replace(/[₱,]/g, "")) || 0;
    const cash = parseFloat(cashReceivedInput.value) || 0;
    const change = cash - payAmount;
    changeAmountEl.textContent = `₱${change > 0 ? change.toFixed(2) : '0.00'}`;
    completePaymentBtn.disabled = !(cash >= payAmount && payAmount > 0);
  }

  // Set up payment modal event listeners
  cashReceivedInput?.addEventListener("input", updateChange);
  quickAmountBtns.forEach(btn => {
    btn.addEventListener("click", () => {
      const payAmount = parseFloat(payAmountEl.textContent.replace(/[₱,]/g, "")) || 0;
      let amt = btn.dataset.amount;
      if (amt === "exact") amt = payAmount;
      cashReceivedInput.value = amt;
      updateChange();
    });
  });

  // Cancel Transaction button
  document.getElementById("cancelTransaction")?.addEventListener("click", () => {
    const transSection = document.getElementById("transactionsSection");
    const paySection = document.getElementById("paymentSection");
    const tabButtons = document.getElementById("tabButtons");
    
    if (paySection) paySection.classList.add("hidden");
    if (transSection) transSection.style.display = "";
    if (tabButtons) tabButtons.style.display = "";
  });

  // Complete Payment logic
  completePaymentBtn?.addEventListener("click", () => {
    // Hide payment page, show payment success UI
    const paySection = document.getElementById("paymentSection");
    const paySuccessSection = document.getElementById("paymentSuccessSection");
    const tabButtons = document.getElementById("tabButtons");
    
    if (paySection) paySection.classList.add("hidden");
    if (paySuccessSection) paySuccessSection.classList.remove("hidden");
    if (tabButtons) tabButtons.style.display = "none";

    // Fill receipt details
    document.getElementById("receiptTransactionId").textContent = document.getElementById("summaryTransactionId").textContent;
    document.getElementById("receiptDateTime").textContent = document.getElementById("summaryDateTime").textContent;
    // Patient and Staff (placeholder, can be improved)
    document.getElementById("receiptPatient").textContent = "Walk-in";
    document.getElementById("receiptStaff").textContent = "Staff Name";
    // Items
    const receiptItems = document.getElementById("receiptItems");
    receiptItems.innerHTML = cart.map(item => `<tr><td>${item.name}</td><td class='text-center'>${item.qty}</td><td class='text-center'>₱${item.price.toFixed(2)}</td><td class='text-right'>₱${(item.price*item.qty).toFixed(2)}</td></tr>`).join("");
    const total = cart.reduce((s,i)=>s+i.price*i.qty,0);
    document.getElementById("receiptTotal").textContent = `₱${total.toFixed(2)}`;
    document.getElementById("receiptCashPaid").textContent = `₱${parseFloat(cashReceivedInput.value).toFixed(2)}`;
    const change = parseFloat(cashReceivedInput.value) - total;
    document.getElementById("receiptChange").textContent = `₱${change > 0 ? change.toFixed(2) : '0.00'}`;

    // Reset cart for new transaction
    cart = [];
    renderCart();
  });

  // New Transaction button
  document.getElementById("newTransaction")?.addEventListener("click", () => {
    const transSection = document.getElementById("transactionsSection");
    const paySuccessSection = document.getElementById("paymentSuccessSection");
    const tabButtons = document.getElementById("tabButtons");
    
    if (paySuccessSection) paySuccessSection.classList.add("hidden");
    if (transSection) transSection.style.display = "";
    if (tabButtons) tabButtons.style.display = "";
    
    // Reset cart/UI
    cart = [];
    renderCart();
  });

  // Return to Transactions button (from payment success)
  document.getElementById("returnToTransactions")?.addEventListener("click", () => {
    const transSection = document.getElementById("transactionsSection");
    const paySuccessSection = document.getElementById("paymentSuccessSection");
    const tabButtons = document.getElementById("tabButtons");
    
    if (paySuccessSection) paySuccessSection.classList.add("hidden");
    if (transSection) transSection.style.display = "";
    if (tabButtons) tabButtons.style.display = "";
    
    // Reset cart/UI
    cart = [];
    renderCart();
  });

  /* ================= CART ================= */
  function addToCart(product) {
    const existing = cart.find(i => i.id === product.id);
    if (existing) existing.qty++;
    else cart.push({ ...product, qty: 1 });
    renderCart();
  }

  function setQty(id, value) {
    const item = cart.find(i => i.id === id);
    if (!item) return;

    const qty = Number(value);
    if (qty <= 0 || isNaN(qty)) {
      cart = cart.filter(i => i.id !== id);
    } else {
      item.qty = qty;
    }
    renderCart();
  }

  function updateQty(id, delta) {
    const item = cart.find(i => i.id === id);
    if (!item) return;
    item.qty += delta;
    if (item.qty <= 0) {
      cart = cart.filter(i => i.id !== id);
    }
    renderCart();
  }

  function clearCart() {
    cart = [];
    renderCart();
  }

  /* ================= RENDER CART ================= */

  function renderCart() {
    cartItems.innerHTML = "";
    cartCount.textContent = cart.reduce((s, i) => s + i.qty, 0);
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
      total += item.price * item.qty; // For now, no extra fees

      const row = document.createElement("div");
      row.className = "flex justify-between items-center border-b pb-2 mb-2";
      row.innerHTML = `
        <div>
          <p class="font-medium">${item.name}</p>
          <p class="text-xs text-gray-500">
            ₱${item.price.toFixed(2)} each
          </p>
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
      // Only update on blur or Enter, not on every input
      qtyInput.onblur = e => setQty(item.id, e.target.value);
      qtyInput.onkeydown = e => {
        if (e.key === "Enter") {
          setQty(item.id, e.target.value);
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

  // Proceed to Payment button setup
  proceedPaymentBtn?.addEventListener("click", () => {
    if (cart.length === 0) return;

    console.log("=== PROCEED TO PAYMENT ===");

    // Hide transactions, show payment page
    const transSection = document.getElementById("transactionsSection");
    const paySection = document.getElementById("paymentSection");
    const tabButtons = document.getElementById("tabButtons");
    
    if (transSection) transSection.style.display = "none";
    if (paySection) paySection.classList.remove("hidden");
    if (tabButtons) tabButtons.style.display = "none";

    // Fill payment page data
    const now = new Date();
    const transactionId = `SAMPLE-${Math.random().toString(36).substr(2,8).toUpperCase()}`;

    document.getElementById("summaryTransactionId").textContent = transactionId;
    document.getElementById("summaryItems").textContent = `${cart.length} item(s)`;
    document.getElementById("summaryDateTime").textContent = now.toLocaleString();

    const itemsList = document.getElementById("summaryItemsList");
    itemsList.innerHTML = cart.map(item => `
      <div class="flex justify-between border-b pb-2 mb-2">
        <span>${item.name} <span class="text-xs text-gray-400">x${item.qty}</span></span>
        <span>₱${(item.price * item.qty).toFixed(2)}</span>
      </div>
    `).join("");

    const total = cart.reduce((s, i) => s + i.price * i.qty, 0);
    document.getElementById("summaryTotal").textContent = `₱${total.toFixed(2)}`;
    document.getElementById("payAmount").textContent = `₱${total.toFixed(2)}`;

    if (cashReceivedInput) cashReceivedInput.value = "";
    if (changeAmountEl) changeAmountEl.textContent = `₱0.00`;
    if (completePaymentBtn) completePaymentBtn.disabled = true;

    document.getElementById("quickExact").textContent = total.toFixed(2);

    console.log("Payment page filled");
  });

  // Back to Transactions button
  document.getElementById("backToTransactions")?.addEventListener("click", () => {
    const transSection = document.getElementById("transactionsSection");
    const paySection = document.getElementById("paymentSection");
    const tabButtons = document.getElementById("tabButtons");
    
    if (paySection) paySection.classList.add("hidden");
    if (transSection) transSection.style.display = "";
    if (tabButtons) tabButtons.style.display = "";
  });

  // Cancel Transaction button
  document.getElementById("cancelTransaction")?.addEventListener("click", () => {
    const transSection = document.getElementById("transactionsSection");
    const paySection = document.getElementById("paymentSection");
    const tabButtons = document.getElementById("tabButtons");
    
    if (paySection) paySection.classList.add("hidden");
    if (transSection) transSection.style.display = "";
    if (tabButtons) tabButtons.style.display = "";
  });


  // Cancel button logic (clear cart)
  document.getElementById("cancelPayment")?.addEventListener("click", () => {
    cart = [];
    renderCart();
  });

  clearCartBtn?.addEventListener("click", clearCart);
}


