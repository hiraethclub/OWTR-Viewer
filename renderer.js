let map;
let markersLayer;
let allRecords = [];
let filteredRecords = [];
let markerRefs = [];

// Initialise map
function initMap() {
  const emptyState = document.getElementById('empty-state');
  if (emptyState) emptyState.remove();

  if (map) return;

  map = L.map('map', {
    center: [54.5, -2],
    zoom: 6,
    zoomControl: true
  });

  L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/">CARTO</a>',
    subdomains: 'abcd',
    maxZoom: 19
  }).addTo(map);

  markersLayer = L.layerGroup().addTo(map);
}

// Parse CSV
function parseCSV(text) {
  const lines = text.split('\n');
  if (lines.length < 2) return [];

  // Parse header to find column indices
  const header = parseCSVLine(lines[0]);
  const colMap = {};
  header.forEach((col, i) => {
    colMap[col.trim()] = i;
  });

  const freqIdx = colMap['Frequency (Hz)'];
  const companyIdx = colMap['Licencee Company'];
  const surnameIdx = colMap['Licencee Surname'];
  const firstNameIdx = colMap['Licencee First Name'];
  const latIdx = colMap['Latitude(Deg)'];
  const lngIdx = colMap['Longitude(Deg)'];
  const productIdx = colMap['Product Description'];

  if (freqIdx === undefined || latIdx === undefined || lngIdx === undefined) {
    alert('CSV is missing required columns (Frequency (Hz), Latitude(Deg), Longitude(Deg))');
    return [];
  }

  const records = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const cols = parseCSVLine(line);
    const lat = parseFloat(cols[latIdx]);
    const lng = parseFloat(cols[lngIdx]);
    const freqHz = parseFloat(cols[freqIdx]);

    if (isNaN(lat) || isNaN(lng) || isNaN(freqHz)) continue;

    const company = (cols[companyIdx] || '').trim();
    const surname = (cols[surnameIdx] || '').trim();
    const firstName = (cols[firstNameIdx] || '').trim();
    const product = (cols[productIdx] || '').trim();

    let licensee = company;
    if (!licensee && surname) {
      licensee = firstName ? `${firstName} ${surname}` : surname;
    }

    records.push({
      freqHz,
      freqMHz: freqHz / 1e6,
      licensee,
      surname,
      product,
      lat,
      lng
    });
  }

  return records;
}

// Parse a single CSV line handling quoted fields
function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (i + 1 < line.length && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        current += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ',') {
        result.push(current);
        current = '';
      } else {
        current += ch;
      }
    }
  }
  result.push(current);
  return result;
}

// Apply filters
function applyFilters() {
  const minMHz = parseFloat(document.getElementById('freq-min').value);
  const maxMHz = parseFloat(document.getElementById('freq-max').value);
  const nameFilter = document.getElementById('licensee-filter').value.trim().toLowerCase();

  filteredRecords = allRecords.filter(r => {
    if (!isNaN(minMHz) && r.freqMHz < minMHz) return false;
    if (!isNaN(maxMHz) && r.freqMHz > maxMHz) return false;
    if (nameFilter) {
      const haystack = (r.licensee + ' ' + r.surname).toLowerCase();
      if (!haystack.includes(nameFilter)) return false;
    }
    return true;
  });

  renderResults();
}

// Render markers and table
function renderResults() {
  markersLayer.clearLayers();
  markerRefs = [];

  const tbody = document.getElementById('results-body');
  tbody.innerHTML = '';

  const count = Math.min(filteredRecords.length, 10000);
  document.getElementById('result-count').textContent =
    `(${filteredRecords.length.toLocaleString()}${filteredRecords.length > 10000 ? ', showing 10,000' : ''})`;

  for (let i = 0; i < count; i++) {
    const r = filteredRecords[i];

    // Marker
    const marker = L.circleMarker([r.lat, r.lng], {
      radius: 5,
      fillColor: '#1D9E75',
      color: '#13151d',
      weight: 1,
      fillOpacity: 0.8
    });

    marker.bindPopup(
      `<strong>${r.freqMHz.toFixed(3)} MHz</strong><br>` +
      `${r.licensee || 'Unknown'}<br>` +
      `<em>${r.product || '—'}</em><br>` +
      `<span style="color:#8a8d96">${r.lat.toFixed(5)}, ${r.lng.toFixed(5)}</span>`
    );

    markersLayer.addLayer(marker);
    markerRefs.push(marker);

    // Table row
    const tr = document.createElement('tr');
    tr.innerHTML =
      `<td>${r.freqMHz.toFixed(3)}</td>` +
      `<td title="${escapeHtml(r.licensee)}">${escapeHtml(r.licensee || '—')}</td>` +
      `<td title="${escapeHtml(r.product)}">${escapeHtml(r.product || '—')}</td>`;

    const idx = i;
    tr.addEventListener('click', () => {
      document.querySelectorAll('#results-table tbody tr.active').forEach(el => el.classList.remove('active'));
      tr.classList.add('active');
      const m = markerRefs[idx];
      map.setView(m.getLatLng(), Math.max(map.getZoom(), 12));
      m.openPopup();
    });

    tbody.appendChild(tr);
  }

  document.getElementById('status').textContent =
    `${filteredRecords.length.toLocaleString()} results`;
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// Event listeners
document.getElementById('btn-open').addEventListener('click', () => {
  window.electronAPI.openFileDialog();
});

document.getElementById('btn-filter').addEventListener('click', () => {
  if (allRecords.length === 0) return;
  applyFilters();
});

document.getElementById('btn-clear').addEventListener('click', () => {
  document.getElementById('freq-min').value = '';
  document.getElementById('freq-max').value = '';
  document.getElementById('licensee-filter').value = '';
  if (allRecords.length > 0) {
    filteredRecords = allRecords;
    renderResults();
  }
});

// Allow Enter key to trigger filter
['freq-min', 'freq-max', 'licensee-filter'].forEach(id => {
  document.getElementById(id).addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && allRecords.length > 0) applyFilters();
  });
});

// CSV loaded from main process
window.electronAPI.onCsvLoaded((content, filename) => {
  initMap();
  allRecords = parseCSV(content);
  filteredRecords = allRecords;
  document.getElementById('status').textContent =
    `Loaded ${allRecords.length.toLocaleString()} records from ${filename}`;
  renderResults();

  // Fit map to data bounds
  if (filteredRecords.length > 0) {
    const lats = filteredRecords.slice(0, 10000).map(r => r.lat);
    const lngs = filteredRecords.slice(0, 10000).map(r => r.lng);
    map.fitBounds([
      [Math.min(...lats), Math.min(...lngs)],
      [Math.max(...lats), Math.max(...lngs)]
    ]);
  }
});

// About modal
window.electronAPI.onShowAbout((version) => {
  document.getElementById('about-version').textContent = `v${version}`;
  document.getElementById('about-overlay').classList.add('visible');
});

document.getElementById('about-close').addEventListener('click', () => {
  document.getElementById('about-overlay').classList.remove('visible');
});

document.getElementById('about-overlay').addEventListener('click', (e) => {
  if (e.target === e.currentTarget) {
    document.getElementById('about-overlay').classList.remove('visible');
  }
});

document.getElementById('about-link').addEventListener('click', (e) => {
  e.preventDefault();
  window.electronAPI.openExternal('http://www.hiraeth.club');
});

// Set title with version
window.electronAPI.getVersion().then(version => {
  document.title = `Ofcom Spectrum Map v${version}`;
});
