(function () {
  const $ = (id) => document.getElementById(id);
  function fmt(v) {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      maximumFractionDigits: 2,
    }).format(v);
  }
  function toFixed(v) {
    return Number(v || 0).toFixed(2);
  }
  // Persistent today stats keys
  const KEY_PROFIT = "binary_today_profit";
  const KEY_LOSS = "binary_today_loss";

  // THEME
  const THEME_KEY = "binary_theme";

  function applyTheme(theme) {
    if (theme === "dark") {
      document.body.classList.add("dark");
    } else {
      document.body.classList.remove("dark");
    }
    const btn = $("themeToggle");
    if (btn) {
      btn.textContent = document.body.classList.contains("dark")
        ? "☀️ Light Mode"
        : "🌙 Dark Mode";
    }
  }

  function initTheme() {
    const saved = localStorage.getItem(THEME_KEY);
    const prefersDark =
      window.matchMedia &&
      window.matchMedia("(prefers-color-scheme: dark)").matches;
    const initial = saved || (prefersDark ? "dark" : "light");
    applyTheme(initial);

    const btn = $("themeToggle");
    if (btn) {
      btn.addEventListener("click", () => {
        const next = document.body.classList.contains("dark")
          ? "light"
          : "dark";
        localStorage.setItem(THEME_KEY, next);
        applyTheme(next);
      });
    }
  }

  let state = {
    initialCapital: parseFloat($("totalCapital").value) || 0,
    startAmount: parseFloat($("startAmount").value) || 0,
    desiredProfit: parseFloat($("desiredProfit").value) || 0,
    payoutPercent: parseFloat($("payoutPercent").value) || 90,
    maxTrades: parseInt($("maxTrades").value) || 10,
    rows: [],
    currentCapital: parseFloat($("totalCapital").value) || 0,
  };

  // load saved today's stats
  function loadTodayStats() {
    state.todayProfit = parseFloat(localStorage.getItem(KEY_PROFIT)) || 0;
    state.todayLoss = parseFloat(localStorage.getItem(KEY_LOSS)) || 0;
    updateTodayUI();
  }
  function saveTodayStats() {
    localStorage.setItem(KEY_PROFIT, String(state.todayProfit || 0));
    localStorage.setItem(KEY_LOSS, String(state.todayLoss || 0));
  }
  function resetTodayStats() {
    state.todayProfit = 0;
    state.todayLoss = 0;
    saveTodayStats();
    updateTodayUI();
  }

  function initRows() {
    state.initialCapital = parseFloat($("totalCapital").value) || 0;
    state.startAmount = parseFloat($("startAmount").value) || 0;
    state.desiredProfit = parseFloat($("desiredProfit").value) || 0;
    state.payoutPercent = parseFloat($("payoutPercent").value) || 90;
    state.maxTrades = parseInt($("maxTrades").value) || 10;
    state.currentCapital = state.initialCapital;

    // create rows
    state.rows = [];
    for (let i = 0; i < state.maxTrades; i++) {
      state.rows.push({
        trade: i + 1,
        profitTarget: state.desiredProfit,
        stake: 0,
        profitIfWin: 0,
        lossSoFar: 0,
        capitalBefore: state.initialCapital,
        result: "", // '', 'win', 'loss'
        customStake: false,
      });
    }
    recalc();
  }

  function recalc() {
    // compute stakes and capital based on results
    let capital = state.initialCapital;
    let consecutiveLossesIdx = [];
    let totalProfit = 0,
      totalLoss = 0,
      wins = 0,
      losses = 0,
      tradesDone = 0,
      maxStake = 0;

    for (let i = 0; i < state.rows.length; i++) {
      const r = state.rows[i];

      // stake calculation
      if (r.customStake) {
        // Use custom stake entered by the user
        r.stake = Number(r.stake) || 0;
      } else {
        // Auto calculate stake if no custom stake present
        if (i === 0 || (i > 0 && state.rows[i - 1].result === "win")) {
          r.stake = Number(state.startAmount);
        } else {
          let sumLoss = 0;
          for (const idx of consecutiveLossesIdx)
            sumLoss += Number(state.rows[idx].stake || 0);
          const payout = state.payoutPercent || 100;
          r.stake =
            payout > 0
              ? (sumLoss + Number(r.profitTarget || 0)) / (payout / 100)
              : sumLoss + Number(r.profitTarget || 0);
        }
      }

      r.profitIfWin = Number(r.stake) * (Number(state.payoutPercent) / 100);
      r.capitalBefore = Number(capital);

      // compute lossSoFar up to this index
      let lossSum = 0;
      for (let j = 0; j <= i; j++) {
        if (state.rows[j].result === "loss")
          lossSum += Number(state.rows[j].stake || 0);
      }
      r.lossSoFar = lossSum;

      // check capacity
      r.canPlace = Number(r.stake) <= Number(capital);

      // apply result effects for sequential simulation
      if (r.result === "loss") {
        capital = Number(capital) - Number(r.stake);
        totalLoss += Number(r.stake);
        losses++;
        tradesDone++;
        if (!consecutiveLossesIdx.includes(i)) consecutiveLossesIdx.push(i);
      } else if (r.result === "win") {
        // on win: you get stake + profit back, so net add profitIfWin
        capital = Number(capital) + Number(r.profitIfWin);
        totalProfit += Number(r.profitIfWin);
        wins++;
        tradesDone++;
        consecutiveLossesIdx = [];
      }

      if (Number(r.stake) > maxStake) maxStake = Number(r.stake);
    }

    state.currentCapital = Number(capital);

    // update today's totals from local storage baseline + computed totals
    // We'll persist exactly the totals computed from row results for consistency
    state.todayProfit = totalProfit;
    state.todayLoss = totalLoss;
    saveTodayStats();

    // update UI
    renderTable();
    $("tradesDone").innerText = tradesDone;
    $("winsCount").innerText = wins;
    $("lossesCount").innerText = losses;
    $("currentCapital").innerText = fmt(state.currentCapital);
    $("maxStake").innerText = fmt(maxStake);
    updateTodayUI();
  }

  function renderTable() {
    const wrap = $("tableWrap");
    wrap.innerHTML = "";
    const tbl = document.createElement("table");

    tbl.innerHTML = `<thead><tr><th>Trade #</th><th>Stake</th><th>Profit Target (editable)</th><th>Profit if Win</th><th>Loss So Far</th><th>Capital Before</th><th>Result</th><th>Action</th></tr></thead><tbody></tbody>`;
    wrap.appendChild(tbl);
    const tbody = tbl.querySelector("tbody");

    state.rows.forEach((r, i) => {
      const over = !r.canPlace && r.result === "" ? "overcap" : "";
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${r.trade}</td>
       <td><input type="number" class="small stake-input ${over}" data-idx="${i}" value="${toFixed(
        r.stake
      )}" min="0"></td>
        <td><input type="number" class="small pt" data-idx="${i}" value="${toFixed(
        r.profitTarget
      )}"></td>
        <td>${fmt(r.profitIfWin)}</td>
        <td>${fmt(r.lossSoFar)}</td>
        <td>${fmt(r.capitalBefore)}</td>
        <td>${
          r.result
            ? r.result === "win"
              ? '<span class="win">WIN</span>'
              : '<span class="loss">LOSS</span>'
            : "-"
        }</td>
        <td>
          <button class="winBtn" data-idx="${i}" ${
        !r.canPlace && r.result === "" ? "disabled" : ""
      }>Win</button>
          <button class="lossBtn gray" data-idx="${i}" ${
        !r.canPlace && r.result === "" ? "disabled" : ""
      }>Loss</button>
        </td>`;
      tbody.appendChild(tr);
    });

    // attach listeners
    tbody.querySelectorAll(".pt").forEach((inp) =>
      inp.addEventListener("input", (e) => {
        const idx = Number(e.target.dataset.idx);
        state.rows[idx].profitTarget = parseFloat(e.target.value) || 0;
        recalc();
      })
    );
    // Now, add this block DIRECTLY after the one above (for stake editing)
    tbody.querySelectorAll(".stake-input").forEach((inp) =>
      inp.addEventListener("input", (e) => {
        const idx = Number(e.target.dataset.idx);
        let value = parseFloat(e.target.value);
        if (!isFinite(value)) value = 0;
        state.rows[idx].stake = value;
        state.rows[idx].customStake = true; // So user value is not overwritten
        recalc();
      })
    );

    tbody.querySelectorAll(".winBtn").forEach((b) =>
      b.addEventListener("click", (e) => {
        const idx = Number(e.target.dataset.idx);
        // if can't place, ignore
        if (!state.rows[idx].canPlace) {
          alert("Not enough capital for this stake.");
          return;
        }
        state.rows[idx].result = "win";
        recalc();
      })
    );

    tbody.querySelectorAll(".lossBtn").forEach((b) =>
      b.addEventListener("click", (e) => {
        const idx = Number(e.target.dataset.idx);
        if (!state.rows[idx].canPlace) {
          alert("Not enough capital for this stake.");
          return;
        }
        state.rows[idx].result = "loss";
        recalc();
      })
    );
  }

  // UI helpers
  function updateTodayUI() {
    $("todayProfit").innerText = fmt(state.todayProfit || 0);
    $("todayLoss").innerText = fmt(state.todayLoss || 0);
    const net = Number(state.todayProfit || 0) - Number(state.todayLoss || 0);
    $("todayNet").innerText = fmt(net);
  }

  // Buttons
  $("buildTable").addEventListener("click", initRows);
  $("simulateLossChain").addEventListener("click", () => {
    state.rows.forEach((r) => (r.result = "loss"));
    recalc();
  });
  $("resetAll").addEventListener("click", () => {
    state.rows.forEach((r) => (r.result = ""));
    recalc();
  });
  $("exportCSV").addEventListener("click", () => {
    let csv =
      "Trade,Stake,ProfitTarget,ProfitIfWin,LossSoFar,CapitalBefore,Result\n";
    state.rows.forEach(
      (r) =>
        (csv += `${r.trade},${r.stake},${r.profitTarget},${r.profitIfWin},${r.lossSoFar},${r.capitalBefore},${r.result}\n`)
    );
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "binary_trades.csv";
    a.click();
    URL.revokeObjectURL(url);
  });
  $("resetStats").addEventListener("click", () => {
    if (confirm("Reset today's saved profit/loss?")) {
      resetTodayStats();
    }
  });

  // live update when inputs change
  [
    "totalCapital",
    "startAmount",
    "desiredProfit",
    "payoutPercent",
    "maxTrades",
  ].forEach((id) =>
    $(id).addEventListener("input", () => {
      // if maxTrades changed -> rebuild rows
      if (id === "maxTrades") {
        initRows();
      } else {
        // update state values and recalc
        state.initialCapital =
          parseFloat($("totalCapital").value) || state.initialCapital;
        state.startAmount =
          parseFloat($("startAmount").value) || state.startAmount;
        state.desiredProfit =
          parseFloat($("desiredProfit").value) || state.desiredProfit;
        state.payoutPercent =
          parseFloat($("payoutPercent").value) || state.payoutPercent;
        // adjust initial capital (do not wipe results) and recalc
        state.initialCapital =
          parseFloat($("totalCapital").value) || state.initialCapital;
        recalc();
      }
    })
  );

  // initialize
  initTheme();
  loadTodayStats();
  initRows();
})();
