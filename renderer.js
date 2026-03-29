let map;
let clusterGroup;
let heatLayer;
let radiusCircle;
let allRecords = [];
let filteredRecords = [];
let displayedRecords = [];
let markerRefs = [];
let rawHeaders = [];
let rawRows = [];
let statusColIdx = -1;
let dateColIdx = -1;
let heatmapMode = false;
let sortCol = null;
let sortAsc = true;
let radiusCenter = null;
let radiusKm = null;

// Column indices from CSV
let colFreq, colCompany, colSurname, colFirstName, colLat, colLng, colProduct;

// ── Map initialisation ───────────────────────────────────────────────

function initMap() {
  const emptyState = document.getElementById('empty-state');
  if (emptyState) emptyState.remove();
  if (map) return;

  map = L.map('map', { center: [54.5, -2], zoom: 6, zoomControl: true });

  L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/">CARTO</a>',
    subdomains: 'abcd',
    maxZoom: 19
  }).addTo(map);

  clusterGroup = L.markerClusterGroup({
    maxClusterRadius: 50,
    iconCreateFunction: function (cluster) {
      const count = cluster.getChildCount();
      let size = 'small';
      if (count > 100) size = 'large';
      else if (count > 10) size = 'medium';
      return L.divIcon({
        html: `<div><span>${count}</span></div>`,
        className: `marker-cluster marker-cluster-${size}`,
        iconSize: L.point(40, 40)
      });
    }
  });
  map.addLayer(clusterGroup);

  map.on('moveend', () => {
    if (document.getElementById('viewport-filter').checked) {
      renderResults();
    }
  });
}

// ── CSV parsing ──────────────────────────────────────────────────────

function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (i + 1 < line.length && line[i + 1] === '"') { current += '"'; i++; }
        else inQuotes = false;
      } else current += ch;
    } else {
      if (ch === '"') inQuotes = true;
      else if (ch === ',') { result.push(current); current = ''; }
      else current += ch;
    }
  }
  result.push(current);
  return result;
}

function parseCSV(text) {
  const lines = text.split('\n');
  if (lines.length < 2) return [];

  rawHeaders = parseCSVLine(lines[0]);
  const colMap = {};
  rawHeaders.forEach((col, i) => { colMap[col.trim()] = i; });

  colFreq = colMap['Frequency (Hz)'];
  colCompany = colMap['Licencee Company'];
  colSurname = colMap['Licencee Surname'];
  colFirstName = colMap['Licencee First Name'];
  colLat = colMap['Latitude(Deg)'];
  colLng = colMap['Longitude(Deg)'];
  colProduct = colMap['Product Description'];

  // Optional columns
  statusColIdx = colMap['Status'] !== undefined ? colMap['Status'] : (colMap['Licence Status'] !== undefined ? colMap['Licence Status'] : -1);
  dateColIdx = colMap['Licence Issue Date'] !== undefined ? colMap['Licence Issue Date'] : -1;

  if (colFreq === undefined || colLat === undefined || colLng === undefined) {
    alert('CSV is missing required columns (Frequency (Hz), Latitude(Deg), Longitude(Deg))');
    return [];
  }

  // Show/hide conditional filters
  document.getElementById('status-filter-group').style.display = statusColIdx >= 0 ? '' : 'none';
  document.getElementById('status-separator').style.display = statusColIdx >= 0 ? '' : 'none';
  document.getElementById('date-filter-group').style.display = dateColIdx >= 0 ? '' : 'none';

  const products = new Set();
  rawRows = [];
  const records = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const cols = parseCSVLine(line);
    rawRows.push(cols);

    const lat = parseFloat(cols[colLat]);
    const lng = parseFloat(cols[colLng]);
    const freqHz = parseFloat(cols[colFreq]);
    if (isNaN(lat) || isNaN(lng) || isNaN(freqHz)) continue;

    const company = (cols[colCompany] || '').trim();
    const surname = (cols[colSurname] || '').trim();
    const firstName = (cols[colFirstName] || '').trim();
    const product = (cols[colProduct] || '').trim();
    const status = statusColIdx >= 0 ? (cols[statusColIdx] || '').trim() : '';
    const dateStr = dateColIdx >= 0 ? (cols[dateColIdx] || '').trim() : '';

    let licensee = company;
    if (!licensee && surname) licensee = firstName ? `${firstName} ${surname}` : surname;

    if (product) products.add(product);

    records.push({
      freqHz, freqMHz: freqHz / 1e6,
      licensee, surname, product,
      lat, lng, status, dateStr,
      rawIdx: rawRows.length - 1
    });
  }

  // Populate product dropdown
  const productSelect = document.getElementById('product-filter');
  productSelect.innerHTML = '<option value="">All Products</option>';
  Array.from(products).sort().forEach(p => {
    const opt = document.createElement('option');
    opt.value = p;
    opt.textContent = p;
    productSelect.appendChild(opt);
  });

  return records;
}

// ── County dropdown ──────────────────────────────────────────────────

function populateCountyDropdown() {
  const select = document.getElementById('county-filter');
  select.innerHTML = '<option value="">All UK</option>';
  for (const region of ['Wales', 'England', 'Scotland', 'Northern Ireland']) {
    const group = document.createElement('optgroup');
    group.label = region;
    const counties = UK_COUNTIES[region];
    for (const name of Object.keys(counties).sort()) {
      const opt = document.createElement('option');
      opt.value = `${region}|${name}`;
      opt.textContent = name;
      group.appendChild(opt);
    }
    select.appendChild(group);
  }
}
populateCountyDropdown();

// ── Filtering ────────────────────────────────────────────────────────

function applyFilters() {
  const minMHz = parseFloat(document.getElementById('freq-min').value);
  const maxMHz = parseFloat(document.getElementById('freq-max').value);
  const nameFilter = document.getElementById('licensee-filter').value.trim().toLowerCase();
  const countyVal = document.getElementById('county-filter').value;
  const productVal = document.getElementById('product-filter').value;
  const statusVal = document.getElementById('status-filter').value;
  const dateFrom = document.getElementById('date-from').value;
  const dateTo = document.getElementById('date-to').value;

  let countyBbox = null;
  if (countyVal) {
    const [region, county] = countyVal.split('|');
    countyBbox = UK_COUNTIES[region][county];
  }

  filteredRecords = allRecords.filter(r => {
    if (!isNaN(minMHz) && r.freqMHz < minMHz) return false;
    if (!isNaN(maxMHz) && r.freqMHz > maxMHz) return false;
    if (nameFilter) {
      const haystack = (r.licensee + ' ' + r.surname).toLowerCase();
      if (!haystack.includes(nameFilter)) return false;
    }
    if (countyBbox) {
      if (r.lat < countyBbox[0] || r.lat > countyBbox[2] ||
          r.lng < countyBbox[1] || r.lng > countyBbox[3]) return false;
    }
    if (productVal && r.product !== productVal) return false;
    if (statusVal && r.status !== statusVal) return false;
    if (dateFrom && r.dateStr && r.dateStr < dateFrom) return false;
    if (dateTo && r.dateStr && r.dateStr > dateTo) return false;
    if (radiusCenter && radiusKm) {
      const dist = haversine(radiusCenter[0], radiusCenter[1], r.lat, r.lng);
      if (dist > radiusKm) return false;
    }
    return true;
  });

  // Apply sort
  if (sortCol) {
    const dir = sortAsc ? 1 : -1;
    filteredRecords.sort((a, b) => {
      const va = a[sortCol];
      const vb = b[sortCol];
      if (typeof va === 'number') return (va - vb) * dir;
      return String(va || '').localeCompare(String(vb || '')) * dir;
    });
  }

  renderResults();
}

// ── Rendering ────────────────────────────────────────────────────────

function renderResults() {
  clusterGroup.clearLayers();
  if (heatLayer) { map.removeLayer(heatLayer); heatLayer = null; }
  markerRefs = [];

  const viewportFilter = document.getElementById('viewport-filter').checked;
  let records = filteredRecords;

  if (viewportFilter && map) {
    const bounds = map.getBounds();
    records = records.filter(r =>
      r.lat >= bounds.getSouth() && r.lat <= bounds.getNorth() &&
      r.lng >= bounds.getWest() && r.lng <= bounds.getEast()
    );
  }

  displayedRecords = records;

  const total = allRecords.length;
  const filtered = filteredRecords.length;
  const shown = records.length;
  const cap = Math.min(shown, 10000);

  document.getElementById('result-count').textContent =
    `(${shown.toLocaleString()}${shown > 10000 ? ' showing 10,000' : ''} / ${total.toLocaleString()} total)`;
  document.getElementById('status').textContent =
    `${shown.toLocaleString()} of ${total.toLocaleString()} records`;

  if (heatmapMode) {
    const heatData = [];
    for (let i = 0; i < records.length; i++) {
      heatData.push([records[i].lat, records[i].lng, 0.5]);
    }
    heatLayer = L.heatLayer(heatData, {
      radius: 18, blur: 20, maxZoom: 17,
      gradient: { 0.2: '#13151d', 0.4: '#1D9E75', 0.7: '#4ee0a8', 1.0: '#ffffff' }
    }).addTo(map);
  } else {
    for (let i = 0; i < cap; i++) {
      const r = records[i];
      const marker = L.circleMarker([r.lat, r.lng], {
        radius: 5, fillColor: '#1D9E75', color: '#13151d', weight: 1, fillOpacity: 0.8
      });
      marker.bindPopup(
        `<strong>${r.freqMHz.toFixed(3)} MHz</strong><br>` +
        `${r.licensee || 'Unknown'}<br>` +
        `<em>${r.product || '—'}</em><br>` +
        `<span style="color:#8a8d96">${r.lat.toFixed(5)}, ${r.lng.toFixed(5)}</span>`
      );
      clusterGroup.addLayer(marker);
      markerRefs.push(marker);
    }
  }

  // Table
  const tbody = document.getElementById('results-body');
  tbody.innerHTML = '';
  for (let i = 0; i < cap; i++) {
    const r = records[i];
    const tr = document.createElement('tr');
    tr.innerHTML =
      `<td>${r.freqMHz.toFixed(3)}</td>` +
      `<td title="${escapeHtml(r.licensee)}">${escapeHtml(r.licensee || '—')}</td>` +
      `<td title="${escapeHtml(r.product)}">${escapeHtml(r.product || '—')}</td>`;
    const idx = i;
    tr.addEventListener('click', () => {
      document.querySelectorAll('#results-table tbody tr.active').forEach(el => el.classList.remove('active'));
      tr.classList.add('active');
      if (!heatmapMode && markerRefs[idx]) {
        const m = markerRefs[idx];
        map.setView(m.getLatLng(), Math.max(map.getZoom(), 12));
        m.openPopup();
      } else {
        map.setView([records[idx].lat, records[idx].lng], Math.max(map.getZoom(), 12));
      }
    });
    tbody.appendChild(tr);
  }
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// ── Haversine ────────────────────────────────────────────────────────

function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ── Geocoding (Nominatim) ────────────────────────────────────────────

async function geocodeLocation(query) {
  const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&countrycodes=gb&limit=1`;
  const resp = await fetch(url, {
    headers: { 'User-Agent': 'OfcomSpectrumMap/1.0 (Electron desktop app)' }
  });
  const data = await resp.json();
  if (data.length === 0) return null;
  return [parseFloat(data[0].lat), parseFloat(data[0].lon)];
}

// ── Sorting ──────────────────────────────────────────────────────────

function updateSortArrows() {
  document.querySelectorAll('#results-table th.sortable').forEach(th => {
    const arrow = th.querySelector('.sort-arrow');
    if (th.dataset.sort === sortCol) {
      arrow.textContent = sortAsc ? ' ▲' : ' ▼';
      th.classList.add('sorted');
    } else {
      arrow.textContent = '';
      th.classList.remove('sorted');
    }
  });
}

document.querySelectorAll('#results-table th.sortable').forEach(th => {
  th.addEventListener('click', () => {
    const col = th.dataset.sort;
    if (sortCol === col) sortAsc = !sortAsc;
    else { sortCol = col; sortAsc = true; }
    updateSortArrows();
    applyFilters();
  });
});

// ── Export ────────────────────────────────────────────────────────────

async function exportCSV() {
  if (displayedRecords.length === 0) return;

  const headerLine = rawHeaders.join(',');
  const lines = [headerLine];

  for (const r of displayedRecords) {
    const row = rawRows[r.rawIdx];
    lines.push(row.map(cell => {
      if (cell.includes(',') || cell.includes('"') || cell.includes('\n')) {
        return '"' + cell.replace(/"/g, '""') + '"';
      }
      return cell;
    }).join(','));
  }

  const content = lines.join('\n');
  const result = await window.electronAPI.saveFileDialog('ofcom-filtered.csv');
  if (!result.canceled && result.filePath) {
    await window.electronAPI.writeFile(result.filePath, content);
  }
}

// ── Event listeners ──────────────────────────────────────────────────

document.getElementById('btn-open').addEventListener('click', () => {
  window.electronAPI.openFileDialog();
});

document.getElementById('btn-filter').addEventListener('click', () => {
  if (allRecords.length === 0) return;
  applyFilters();
});

document.getElementById('btn-reset').addEventListener('click', () => {
  document.getElementById('freq-min').value = '';
  document.getElementById('freq-max').value = '';
  document.getElementById('licensee-filter').value = '';
  document.getElementById('county-filter').value = '';
  document.getElementById('product-filter').value = '';
  document.getElementById('status-filter').value = '';
  document.getElementById('date-from').value = '';
  document.getElementById('date-to').value = '';
  document.getElementById('location-input').value = '';
  document.getElementById('radius-input').value = '';
  document.getElementById('viewport-filter').checked = false;
  radiusCenter = null;
  radiusKm = null;
  if (radiusCircle) { map.removeLayer(radiusCircle); radiusCircle = null; }
  sortCol = null;
  sortAsc = true;
  updateSortArrows();
  if (allRecords.length > 0) {
    filteredRecords = allRecords;
    renderResults();
  }
});

document.getElementById('btn-export').addEventListener('click', exportCSV);

document.getElementById('btn-heatmap').addEventListener('click', () => {
  heatmapMode = !heatmapMode;
  const btn = document.getElementById('btn-heatmap');
  btn.classList.toggle('active-toggle', heatmapMode);
  btn.textContent = heatmapMode ? 'Markers' : 'Heatmap';
  if (allRecords.length > 0) renderResults();
});

// Band presets
document.querySelectorAll('.preset-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.getElementById('freq-min').value = btn.dataset.min;
    document.getElementById('freq-max').value = btn.dataset.max;
    if (allRecords.length > 0) applyFilters();
  });
});

// Enter key on filter inputs
['freq-min', 'freq-max', 'licensee-filter'].forEach(id => {
  document.getElementById(id).addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && allRecords.length > 0) applyFilters();
  });
});

// Instant filter on dropdown changes
['county-filter', 'product-filter', 'status-filter'].forEach(id => {
  document.getElementById(id).addEventListener('change', () => {
    if (allRecords.length > 0) applyFilters();
  });
});

['date-from', 'date-to'].forEach(id => {
  document.getElementById(id).addEventListener('change', () => {
    if (allRecords.length > 0) applyFilters();
  });
});

document.getElementById('viewport-filter').addEventListener('change', () => {
  if (allRecords.length > 0) renderResults();
});

// Radius filter
document.getElementById('btn-radius').addEventListener('click', async () => {
  const loc = document.getElementById('location-input').value.trim();
  const km = parseFloat(document.getElementById('radius-input').value);
  if (!loc || isNaN(km) || km <= 0) return;

  const coords = await geocodeLocation(loc);
  if (!coords) { alert('Location not found'); return; }

  radiusCenter = coords;
  radiusKm = km;

  if (radiusCircle) map.removeLayer(radiusCircle);
  radiusCircle = L.circle(coords, {
    radius: km * 1000,
    color: '#1D9E75',
    fillColor: '#1D9E75',
    fillOpacity: 0.08,
    weight: 2
  }).addTo(map);

  map.fitBounds(radiusCircle.getBounds());
  if (allRecords.length > 0) applyFilters();
});

document.getElementById('btn-radius-clear').addEventListener('click', () => {
  radiusCenter = null;
  radiusKm = null;
  document.getElementById('location-input').value = '';
  document.getElementById('radius-input').value = '';
  if (radiusCircle) { map.removeLayer(radiusCircle); radiusCircle = null; }
  if (allRecords.length > 0) applyFilters();
});

document.getElementById('location-input').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') document.getElementById('btn-radius').click();
});

// ── CSV load from main process ───────────────────────────────────────

window.electronAPI.onCsvLoaded((content, filename) => {
  initMap();
  allRecords = parseCSV(content);
  filteredRecords = allRecords;
  sortCol = null;
  sortAsc = true;
  updateSortArrows();

  document.getElementById('status').textContent =
    `Loaded ${allRecords.length.toLocaleString()} records from ${filename}`;
  renderResults();

  if (filteredRecords.length > 0) {
    const sample = filteredRecords.slice(0, 10000);
    const lats = sample.map(r => r.lat);
    const lngs = sample.map(r => r.lng);
    map.fitBounds([
      [Math.min(...lats), Math.min(...lngs)],
      [Math.max(...lats), Math.max(...lngs)]
    ]);
  }
});

// ── About modal ──────────────────────────────────────────────────────

window.electronAPI.onShowAbout((version) => {
  document.getElementById('about-version').textContent = `v${version}`;
  document.getElementById('about-overlay').classList.add('visible');
});

document.getElementById('about-close').addEventListener('click', () => {
  document.getElementById('about-overlay').classList.remove('visible');
});

document.getElementById('about-overlay').addEventListener('click', (e) => {
  if (e.target === e.currentTarget)
    document.getElementById('about-overlay').classList.remove('visible');
});

document.getElementById('about-link').addEventListener('click', (e) => {
  e.preventDefault();
  window.electronAPI.openExternal('http://www.hiraeth.club');
});

// Set title with version
window.electronAPI.getVersion().then(version => {
  document.title = `Ofcom Spectrum Map v${version}`;
});
