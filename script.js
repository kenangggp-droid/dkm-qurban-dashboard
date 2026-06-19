const currency = new Intl.NumberFormat("id-ID", {
  style: "currency",
  currency: "IDR",
  maximumFractionDigits: 0,
});

let appData = null;
const months = ["Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des", "Jan", "Feb", "Mar", "Apr", "Mei"];

const elements = {
  sourceName: document.querySelector("#sourceName"),
  syncStatus: document.querySelector("#syncStatus"),
  totalFunds: document.querySelector("#totalFunds"),
  totalParticipants: document.querySelector("#totalParticipants"),
  activeParticipants: document.querySelector("#activeParticipants"),
  participantRows: document.querySelector("#participantRows"),
  rowCount: document.querySelector("#rowCount"),
  searchInput: document.querySelector("#searchInput"),
  statusFilter: document.querySelector("#statusFilter"),
  openQris: document.querySelector("#openQris"),
  closeQris: document.querySelector("#closeQris"),
  qrisDialog: document.querySelector("#qrisDialog"),
  qrisImage: document.querySelector("#qrisImage"),
  qrisFallback: document.querySelector("#qrisFallback"),
};

function setSyncStatus(message, mode) {
  elements.syncStatus.textContent = message;
  elements.syncStatus.className = `sync-status ${mode || ""}`.trim();
}

function formatCurrency(value) {
  return currency.format(value).replace(/\s/g, "");
}

function parseCurrency(value) {
  if (value === null || value === undefined) return 0;
  let cleaned = String(value).trim().replace(/[^\d,.-]/g, "");
  if (!cleaned || cleaned === "-") return 0;

  const lastComma = cleaned.lastIndexOf(",");
  const lastDot = cleaned.lastIndexOf(".");

  if (lastComma !== -1 && lastDot !== -1) {
    cleaned =
      lastDot > lastComma
        ? cleaned.replace(/,/g, "")
        : cleaned.replace(/\./g, "").replace(",", ".");
  } else if (lastComma !== -1) {
    const decimalDigits = cleaned.length - lastComma - 1;
    cleaned = decimalDigits === 3 ? cleaned.replace(/,/g, "") : cleaned.replace(",", ".");
  } else if (lastDot !== -1) {
    const decimalDigits = cleaned.length - lastDot - 1;
    if (decimalDigits === 3) cleaned = cleaned.replace(/\./g, "");
  }

  return Number.parseFloat(cleaned) || 0;
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];

    if (char === '"' && quoted && next === '"') {
      cell += '"';
      index += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      row.push(cell);
      cell = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && next === "\n") index += 1;
      row.push(cell);
      if (row.some((value) => value.trim() !== "")) rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }

  row.push(cell);
  if (row.some((value) => value.trim() !== "")) rows.push(row);
  return rows;
}

function findColumn(headers, names) {
  return headers.findIndex((header) => names.includes(header.trim().toLowerCase()));
}

function buildDataFromRows(rows, source) {
  const headers = rows[0].map((header) => String(header || "").trim());
  const normalizedHeaders = headers.map((header) => header.toLowerCase());
  const nameIndex = findColumn(normalizedHeaders, ["nama peserta", "nama", "name"]);

  if (nameIndex === -1) {
    throw new Error("Kolom nama peserta tidak ditemukan.");
  }

  const monthIndexes = months.map((month) => {
    const index = normalizedHeaders.indexOf(month.toLowerCase());
    if (index === -1) {
      throw new Error(`Kolom ${month} tidak ditemukan.`);
    }
    return index;
  });

  const participants = rows
    .slice(1)
    .map((row) => {
      const name = String(row[nameIndex] || "").trim();
      if (!name) return null;

      const monthly = Object.fromEntries(
        months.map((month, index) => [month, parseCurrency(row[monthIndexes[index]])]),
      );
      const total = Object.values(monthly).reduce((sum, value) => sum + value, 0);

      return {
        name,
        monthly,
        total,
        status: total > 0 ? "AKTIF" : "BELUM SETOR",
      };
    })
    .filter(Boolean);

  const monthlyTotals = Object.fromEntries(
    months.map((month) => [
      month,
      participants.reduce((sum, participant) => sum + participant.monthly[month], 0),
    ]),
  );

  return {
    source,
    title: "Dashboard Tabungan Qurban",
    months,
    participants,
    summary: {
      totalParticipants: participants.length,
      activeParticipants: participants.filter((participant) => participant.total > 0).length,
      totalFunds: participants.reduce((sum, participant) => sum + participant.total, 0),
      monthlyTotals,
    },
  };
}

function timeoutAfter(ms, message) {
  return new Promise((_, reject) => {
    window.setTimeout(() => reject(new Error(message)), ms);
  });
}

function googleSheetsVizUrl(url) {
  const parsed = new URL(url);
  const isGoogleSheet = parsed.hostname === "docs.google.com" && parsed.pathname.includes("/spreadsheets/");

  if (!isGoogleSheet) return null;

  const gid = parsed.searchParams.get("gid");
  const path = parsed.pathname;
  const publishedMatch = path.match(/\/spreadsheets\/d\/e\/([^/]+)/);
  const documentMatch = path.match(/\/spreadsheets\/d\/([^/]+)/);
  const spreadsheetKey = publishedMatch?.[1] || documentMatch?.[1];

  if (!spreadsheetKey) return null;

  const basePath = publishedMatch
    ? `/spreadsheets/d/e/${spreadsheetKey}/gviz/tq`
    : `/spreadsheets/d/${spreadsheetKey}/gviz/tq`;
  const visualizationUrl = new URL(`${parsed.origin}${basePath}`);

  if (gid) visualizationUrl.searchParams.set("gid", gid);
  visualizationUrl.searchParams.set("tqx", "out:json");
  visualizationUrl.searchParams.set("_", Date.now().toString());

  return visualizationUrl.toString();
}

function loadGoogleSheetsRows(url) {
  return new Promise((resolve, reject) => {
    const callback = `qurbanSheet_${Date.now()}_${Math.random().toString(16).slice(2)}`;
    const visualizationUrl = new URL(url);
    visualizationUrl.searchParams.set("tqx", `responseHandler:${callback}`);

    const script = document.createElement("script");
    const cleanup = () => {
      delete window[callback];
      script.remove();
    };

    window[callback] = (response) => {
      cleanup();

      if (response.status === "error") {
        reject(new Error(response.errors?.[0]?.detailed_message || "Google Sheets tidak bisa dibaca."));
        return;
      }

      const columns = response.table.cols.map((column) => column.label || column.id || "");
      const rows = response.table.rows.map((row) =>
        columns.map((_, index) => {
          const cell = row.c[index];
          return cell ? cell.v ?? "" : "";
        }),
      );

      resolve([columns, ...rows]);
    };

    script.onerror = () => {
      cleanup();
      reject(new Error("Gagal memuat Google Sheets online."));
    };

    script.src = visualizationUrl.toString();
    document.head.append(script);
  });
}

async function loadOnlineData() {
  let url = window.QURBAN_CONFIG?.onlineCsvUrl?.trim();

  if (!url && window.location.protocol !== "file:") {
    const configResponse = await fetch(`config.json?_=${Date.now()}`, { cache: "no-store" });
    if (configResponse.ok) {
      const config = await configResponse.json();
      url = config.onlineCsvUrl?.trim();
    }
  }

  if (!url) return null;

  try {
    const csvUrl = new URL(url, window.location.href);
    csvUrl.searchParams.set("_", Date.now().toString());
    const response = await Promise.race([
      fetch(csvUrl.toString(), { cache: "no-store" }),
      timeoutAfter(8000, "Google Sheets terlalu lama merespons"),
    ]);
    if (!response.ok) {
      throw new Error(`Spreadsheet online gagal dibaca (${response.status}).`);
    }

    const rows = parseCsv(await response.text());
    if (rows.length < 2) {
      throw new Error("Spreadsheet online belum berisi data peserta.");
    }

    return buildDataFromRows(rows, "Google Sheets online");
  } catch (csvError) {
    const visualizationUrl = googleSheetsVizUrl(url);
    if (!visualizationUrl) throw csvError;

    const rows = await loadGoogleSheetsRows(visualizationUrl);
    return buildDataFromRows(rows, "Google Sheets online");
  }
}

function renderSummary(data) {
  const { summary } = data;

  elements.sourceName.textContent = data.source;
  elements.totalFunds.textContent = formatCurrency(summary.totalFunds);
  elements.totalParticipants.textContent = summary.totalParticipants;
  elements.activeParticipants.textContent = summary.activeParticipants;
}

function setupQrisDialog() {
  const showFallback = () => {
    elements.qrisImage.hidden = true;
    elements.qrisFallback.hidden = false;
  };

  elements.openQris.addEventListener("click", () => elements.qrisDialog.showModal());
  elements.closeQris.addEventListener("click", () => elements.qrisDialog.close());
  elements.qrisDialog.addEventListener("click", (event) => {
    if (event.target === elements.qrisDialog) elements.qrisDialog.close();
  });
  elements.qrisImage.addEventListener("error", showFallback);
  if (elements.qrisImage.complete && elements.qrisImage.naturalWidth === 0) showFallback();
}

function renderRows() {
  const query = elements.searchInput.value.trim().toLowerCase();
  const status = elements.statusFilter.value;

  const rows = appData.participants.filter((participant) => {
    const matchesName = participant.name.toLowerCase().includes(query);
    const matchesStatus = status === "all" || participant.status === status;
    return matchesName && matchesStatus;
  });

  elements.rowCount.textContent = `${rows.length} data`;
  elements.participantRows.innerHTML = rows
    .map((participant) => {
      const monthlyRecap = appData.months
        .map((month) => {
          const value = participant.monthly[month];
          return `
            <div class="monthly-payment ${value > 0 ? "paid" : "empty"}">
              <span>${month}</span>
              <strong>${formatCurrency(value)}</strong>
            </div>
          `;
        })
        .join("");

      return `
        <tr>
          <td data-label="Nama"><strong>${participant.name}</strong></td>
          <td data-label="Total" class="amount">${formatCurrency(participant.total)}</td>
          <td data-label="Status"><span class="status ${participant.status === "AKTIF" ? "" : "empty"}">${participant.status}</span></td>
          <td data-label="Rekap Bulanan"><div class="monthly-recap" aria-label="Rekap transfer setiap bulan">${monthlyRecap}</div></td>
        </tr>
      `;
    })
    .join("");
}

async function init() {
  setupQrisDialog();

  try {
    appData = await loadOnlineData();
    if (appData) {
      setSyncStatus("Tersinkron dari spreadsheet online. Refresh halaman setelah mengedit data.", "online");
    }
  } catch (error) {
    console.warn(error);
    setSyncStatus(`Data online belum bisa dibaca: ${error.message}. Memakai data lokal dari Excel terakhir.`, "fallback");
  }

  if (!appData && window.QURBAN_DATA) {
    appData = window.QURBAN_DATA;
    setSyncStatus("Memakai data lokal dari Excel terakhir. Isi URL CSV di config.js untuk sinkron online.", "fallback");
  } else if (!appData) {
    const response = await fetch("data.json");
    appData = await response.json();
    setSyncStatus("Memakai data lokal dari data.json.", "fallback");
  }

  renderSummary(appData);
  appData.months = months;
  renderRows();

  elements.searchInput.addEventListener("input", renderRows);
  elements.statusFilter.addEventListener("change", renderRows);
}

init();
