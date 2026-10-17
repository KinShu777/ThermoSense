// ==============================================================
// URBAN HEAT INTELLIGENCE COMMAND — JAVASCRIPT SYSTEM
// ==============================================================

// DOM Elements: Site Diagnostics
const lst = document.getElementById('lst');
const lstRange = document.getElementById('lst-range');
const lstReadout = document.getElementById('lst-readout');

const ndvi = document.getElementById('ndvi');
const ndviRange = document.getElementById('ndvi-range');
const ndviReadout = document.getElementById('ndvi-readout');

const lulc = document.getElementById('lulc');
const predictBtn = document.getElementById('predict-btn');
const impactBtn = document.getElementById('impact-btn');

const gaugeMarker = document.getElementById('gauge-marker');
const resultEmpty = document.getElementById('result-empty');
const resultContent = document.getElementById('result-content');
const resultZoneLabel = document.getElementById('result-zone-label');
const confidenceValue = document.getElementById('confidence-value');
const probBars = document.getElementById('prob-bars');
const suggestionsList = document.getElementById('suggestions-list');

const impactEmpty = document.getElementById('impact-empty');
const impactContent = document.getElementById('impact-content');
const modelMeta = document.getElementById('model-meta');

// Navigation Tabs
const tabBtnSite = document.getElementById('tab-btn-site');
const tabBtnCity = document.getElementById('tab-btn-city');
const viewSite = document.getElementById('view-site');
const viewCity = document.getElementById('view-city');

// Telemetry Hotspot HUD Elements
const telemetryHotspotId = document.getElementById('telemetry-hotspot-id');
const telemetryRiskBadge = document.getElementById('telemetry-risk-badge');
const telemetrySectorName = document.getElementById('telemetry-sector-name');
const telemetryLst = document.getElementById('telemetry-lst');
const telemetryNdvi = document.getElementById('telemetry-ndvi');
const telemetryLulc = document.getElementById('telemetry-lulc');
const telemetryZoneLabel = document.getElementById('telemetry-zone-label');
const btnLoadHotspot = document.getElementById('btn-load-hotspot');
const hudMapCoords = document.getElementById('hud-map-coords');
const mapResetBtn = document.getElementById('map-reset-btn');

// Preset profiles
const PRESET_DATA = {
  commercial: { lst: 46.5, ndvi: 0.08, lulc: 6 },
  industrial: { lst: 48.2, ndvi: 0.04, lulc: 6 },
  dense_res:  { lst: 42.8, ndvi: 0.16, lulc: 6 },
  suburban:   { lst: 37.6, ndvi: 0.44, lulc: 3 },
  park:       { lst: 32.5, ndvi: 0.72, lulc: 2 },
  waterfront: { lst: 34.0, ndvi: 0.32, lulc: 1 }
};

// Heat spectrum colors
const ZONE_COLORS = {
  1: '#38bdf8', // cold
  2: '#34d399', // cool
  3: '#fbbf24', // mod
  4: '#fb923c', // hot
  5: '#ef4444', // burn
};

// -------------------------------------------------------------
// 1. Slider & Input Syncing
// -------------------------------------------------------------
function syncPair(numberEl, rangeEl, readoutEl, decimals) {
  function update(val) {
    const num = parseFloat(val);
    numberEl.value = num.toFixed(decimals);
    rangeEl.value = num;
    readoutEl.textContent = decimals === 2 ? num.toFixed(2) : `${num.toFixed(1)}°C`;
  }
  numberEl.addEventListener('input', () => update(numberEl.value || 0));
  rangeEl.addEventListener('input', () => update(rangeEl.value));
}
syncPair(lst, lstRange, lstReadout, 1);
syncPair(ndvi, ndviRange, ndviReadout, 2);

function setGaugeFromTemp(tempC) {
  const pct = Math.min(100, Math.max(0, ((tempC - 28) / (52 - 28)) * 100));
  if (gaugeMarker) {
    gaugeMarker.style.left = pct + '%';
  }
}
setGaugeFromTemp(parseFloat(lst.value));
lst.addEventListener('input', () => setGaugeFromTemp(parseFloat(lst.value || 0)));
lstRange.addEventListener('input', () => setGaugeFromTemp(parseFloat(lstRange.value)));

// -------------------------------------------------------------
// 2. Navigation Tabs
// -------------------------------------------------------------
tabBtnSite.addEventListener('click', () => {
  tabBtnSite.classList.add('active');
  tabBtnCity.classList.remove('active');
  viewSite.style.display = 'block';
  viewCity.style.display = 'none';
  if (mapInstance) {
    setTimeout(() => mapInstance.invalidateSize(), 150);
  }
});

tabBtnCity.addEventListener('click', () => {
  tabBtnCity.classList.add('active');
  tabBtnSite.classList.remove('active');
  viewSite.style.display = 'none';
  viewCity.style.display = 'block';
  loadCityMatrix();
});

// -------------------------------------------------------------
// 3. 1-Click Archetype Presets
// -------------------------------------------------------------
document.querySelectorAll('.preset-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.preset-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');

    const key = btn.dataset.preset;
    const data = PRESET_DATA[key];
    if (data) {
      lst.value = data.lst.toFixed(1);
      lstRange.value = data.lst;
      lstReadout.textContent = `${data.lst.toFixed(1)}°C`;

      ndvi.value = data.ndvi.toFixed(2);
      ndviRange.value = data.ndvi;
      ndviReadout.textContent = data.ndvi.toFixed(2);

      lulc.value = data.lulc;
      setGaugeFromTemp(data.lst);

      // Auto-classify on preset click
      predictBtn.click();
    }
  });
});

// -------------------------------------------------------------
// 4. Model Metadata Status
// -------------------------------------------------------------
async function fetchModelInfo() {
  try {
    const res = await fetch('/api/model-info');
    const data = await res.json();
    if (data.f1_weighted != null && modelMeta) {
      modelMeta.textContent = `MODEL: RANDOM FOREST // F1: ${data.f1_weighted.toFixed(2)} // N_SAMPLES: ${data.n_train}`;
    }
  } catch (e) {
    if (modelMeta) {
      modelMeta.textContent = 'MODEL: RANDOM FOREST CLASSIFIER // ACTIVE';
    }
  }
}
fetchModelInfo();

// -------------------------------------------------------------
// 5. Predict Heat Zone (Unchanged Logic & Payload)
// -------------------------------------------------------------
predictBtn.addEventListener('click', async () => {
  predictBtn.disabled = true;
  const originalHtml = predictBtn.innerHTML;
  predictBtn.innerHTML = `
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/></svg>
    <span>CLASSIFYING TELEMETRY…</span>
  `;

  try {
    const res = await fetch('/api/predict', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        lst: parseFloat(lst.value),
        ndvi: parseFloat(ndvi.value),
        lulc: parseInt(lulc.value, 10),
      }),
    });
    const data = await res.json();
    if (data.error) throw new Error(data.error);

    resultEmpty.style.display = 'none';
    resultContent.style.display = 'block';

    resultZoneLabel.textContent = `Zone ${data.predicted_zone}: ${data.predicted_label}`;
    resultZoneLabel.style.color = ZONE_COLORS[data.predicted_zone] || 'var(--text)';
    confidenceValue.textContent = (data.confidence * 100).toFixed(1) + '%';

    probBars.innerHTML = '';
    Object.keys(data.class_probabilities)
      .sort()
      .forEach((key) => {
        const zoneNum = key.replace('prob_zone_', '');
        const prob = data.class_probabilities[key];
        const row = document.createElement('div');
        row.className = 'prob-bar-row';
        row.innerHTML = `
          <span>ZONE ${zoneNum}</span>
          <div class="prob-bar-track">
            <div class="prob-bar-fill" style="width:${(prob*100).toFixed(1)}%; background:${ZONE_COLORS[zoneNum] || 'var(--accent)'}"></div>
          </div>
          <span>${(prob*100).toFixed(0)}%</span>
        `;
        probBars.appendChild(row);
      });

    suggestionsList.innerHTML = '';
    data.mitigation_suggestions.forEach((s) => {
      const li = document.createElement('li');
      li.textContent = s;
      suggestionsList.appendChild(li);
    });

    setGaugeFromTemp(parseFloat(lst.value));
  } catch (err) {
    resultEmpty.style.display = 'block';
    resultContent.style.display = 'none';
    resultEmpty.textContent = 'Error: ' + err.message;
  } finally {
    predictBtn.disabled = false;
    predictBtn.innerHTML = originalHtml;
  }
});

// -------------------------------------------------------------
// 6. Advanced Impact & Co-Benefits Simulation (Unchanged API)
// -------------------------------------------------------------
impactBtn.addEventListener('click', async () => {
  const changes = Array.from(document.querySelectorAll('.interventions-checklist input:checked')).map(c => c.value);
  if (changes.length === 0) {
    impactEmpty.style.display = 'block';
    impactContent.style.display = 'none';
    impactEmpty.textContent = 'Select at least one spatial intervention to simulate.';
    return;
  }

  impactBtn.disabled = true;
  const originalHtml = impactBtn.innerHTML;
  impactBtn.innerHTML = `<span>SIMULATING CO-BENEFITS…</span>`;

  try {
    const res = await fetch('/api/advanced-impact', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        lst: parseFloat(lst.value),
        ndvi: parseFloat(ndvi.value),
        lulc: parseInt(lulc.value, 10),
        changes: changes
      }),
    });
    const data = await res.json();
    if (data.error) throw new Error(data.error);

    impactEmpty.style.display = 'none';
    impactContent.style.display = 'block';

    const b = data.baseline;
    const p = data.projected;
    const imp = data.impact;
    const co = data.cobenefits;

    const baseColor = ZONE_COLORS[b.zone] || '#fff';
    const projColor = ZONE_COLORS[p.zone] || '#34d399';

    impactContent.innerHTML = `
      <!-- BEFORE VS AFTER SHIFT -->
      <div class="shift-card">
        <div class="shift-badge-row">
          <div class="shift-tag" style="border-color:${baseColor}; color:${baseColor};">
            <span class="shift-label">BASELINE CONDITION</span>
            <strong>Zone ${b.zone}: ${b.zone_label}</strong>
          </div>
          <div class="shift-arrow">➔</div>
          <div class="shift-tag projected-tag" style="border-color:${projColor}; color:${projColor};">
            <span class="shift-label">PROJECTED POST-MITIGATION</span>
            <strong>Zone ${p.zone}: ${p.zone_label}</strong>
          </div>
        </div>

        <div class="shift-metrics">
          <div class="shift-metric-item">
            <div class="sm-val">${imp.temp_change > 0 ? '+' : ''}${imp.temp_change}°C</div>
            <div class="sm-lbl">Surface Temp (${b.lst}°C ➔ ${p.lst}°C)</div>
          </div>
          <div class="shift-metric-item">
            <div class="sm-val">+${imp.ndvi_change.toFixed(2)}</div>
            <div class="sm-lbl">Canopy NDVI (${b.ndvi} ➔ ${p.ndvi})</div>
          </div>
          <div class="shift-metric-item">
            <div class="sm-val" style="color:${projColor};">${p.hvi_status}</div>
            <div class="sm-lbl">Heat Vulnerability (-${imp.hvi_reduction} pts)</div>
          </div>
        </div>
      </div>

      <!-- POLICY CO-BENEFITS -->
      <div class="cobenefit-header">🌿 MULTI-SECTOR CO-BENEFITS (PER KM² URBAN AREA)</div>
      <div class="cobenefit-grid">
        <div class="cb-card">
          <div class="cb-val" style="color:var(--cool);">-${co.cooling_demand_reduction_pct}%</div>
          <div class="cb-name">⚡ Peak AC Demand</div>
          <div class="cb-detail">~${co.kwh_saved_annual.toLocaleString()} kWh saved annually</div>
        </div>
        <div class="cb-card">
          <div class="cb-val" style="color:var(--cool);">+${co.carbon_offset_tons} t</div>
          <div class="cb-name">🍃 Carbon Offset</div>
          <div class="cb-detail">Direct sequestration + avoided emissions</div>
        </div>
        <div class="cb-card">
          <div class="cb-val" style="color:var(--mod);">$${co.cost_savings_usd.toLocaleString()}</div>
          <div class="cb-name">💰 Municipal Savings</div>
          <div class="cb-detail">Avoided peak grid generation costs</div>
        </div>
      </div>

      <!-- COOLING CONTRIBUTIONS BREAKDOWN -->
      <div class="breakdown-pills">
        <span class="breakdown-title">Cooling Breakdown:</span>
        ${imp.breakdown.tree_cooling < 0 ? `<span class="breakdown-pill">🌳 Canopy: ${imp.breakdown.tree_cooling}°C</span>` : ''}
        ${imp.breakdown.roof_cooling < 0 ? `<span class="breakdown-pill">🏢 Cool Roofs: ${imp.breakdown.roof_cooling}°C</span>` : ''}
        ${imp.breakdown.pavement_cooling < 0 ? `<span class="breakdown-pill">🛣️ Pavements: ${imp.breakdown.pavement_cooling}°C</span>` : ''}
        ${imp.breakdown.water_cooling < 0 ? `<span class="breakdown-pill">💧 Water: ${imp.breakdown.water_cooling}°C</span>` : ''}
      </div>
    `;
  } catch (err) {
    impactEmpty.style.display = 'block';
    impactContent.style.display = 'none';
    impactEmpty.textContent = 'Error: ' + err.message;
  } finally {
    impactBtn.disabled = false;
    impactBtn.innerHTML = originalHtml;
  }
});

// -------------------------------------------------------------
// 7. City Priority Heatmap & District Scanner (Unchanged API)
// -------------------------------------------------------------
let cityMatrixLoaded = false;
async function loadCityMatrix() {
  if (cityMatrixLoaded) return;
  try {
    const res = await fetch('/api/batch-sample');
    const data = await res.json();
    cityMatrixLoaded = true;

    // Update KPI badges
    if (document.getElementById('kpi-zone5')) {
      document.getElementById('kpi-zone5').textContent = `${data.summary.critical_zone5_pct}%`;
    }
    if (document.getElementById('kpi-avg-temp')) {
      document.getElementById('kpi-avg-temp').textContent = `${data.summary.average_city_lst}°C`;
    }

    // Populate Spatial Grid Tiles
    const spatialGrid = document.getElementById('spatial-districts-grid');
    if (spatialGrid) {
      spatialGrid.innerHTML = '';
      data.districts.forEach(d => {
        const zColor = ZONE_COLORS[d.predicted_zone] || '#fff';
        const card = document.createElement('div');
        card.className = 'spatial-card';
        card.style.borderTop = `3px solid ${zColor}`;
        card.innerHTML = `
          <div class="spatial-card-header">
            <span class="spatial-id">${d.id}</span>
            <span class="spatial-zone-pill" style="background:${zColor}22; color:${zColor}; border:1px solid ${zColor}55;">
              ZONE ${d.predicted_zone}
            </span>
          </div>
          <div class="spatial-name">${d.name}</div>
          <div class="spatial-stats">
            <div><span class="lbl">LST:</span> <strong>${d.lst}°C</strong></div>
            <div><span class="lbl">NDVI:</span> <strong>${d.ndvi}</strong></div>
          </div>
          <button class="spatial-analyze-btn" data-id="${d.id}" type="button">
            INSPECT IN SANDBOX ➔
          </button>
        `;

        card.querySelector('.spatial-analyze-btn').addEventListener('click', () => {
          loadSiteParameters(d.lst, d.ndvi, d.lulc);
          tabBtnSite.click();
          predictBtn.click();
        });

        spatialGrid.appendChild(card);
      });
    }

    // Populate Action Plan Table
    const tbody = document.getElementById('district-table-body');
    if (tbody) {
      tbody.innerHTML = '';
      data.districts.forEach(d => {
        const zColor = ZONE_COLORS[d.predicted_zone] || '#fff';
        const isUrgent = d.predicted_zone >= 4;
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td class="font-mono">${d.id}</td>
          <td><strong>${d.name}</strong></td>
          <td><span class="badge-lst" style="color:${zColor}; font-weight:700;">${d.lst}°C</span></td>
          <td>${d.ndvi}</td>
          <td>${d.lulc_label}</td>
          <td>
            <span class="zone-pill" style="background:${zColor}22; color:${zColor}; border: 1px solid ${zColor}66;">
              Zone ${d.predicted_zone} (${d.predicted_label.split(' ')[0]})
            </span>
          </td>
          <td>
            <div class="table-suggestion">
              ${isUrgent ? '🔴' : '🟢'} ${d.primary_mitigation}
            </div>
          </td>
          <td>
            <button class="btn-table-action" data-id="${d.id}" type="button">Simulate</button>
          </td>
        `;

        tr.querySelector('.btn-table-action').addEventListener('click', () => {
          loadSiteParameters(d.lst, d.ndvi, d.lulc);
          tabBtnSite.click();
          predictBtn.click();
        });

        tbody.appendChild(tr);
      });
    }

  } catch (err) {
    console.error('Failed to load city matrix:', err);
  }
}

function loadSiteParameters(lstVal, ndviVal, lulcVal) {
  lst.value = parseFloat(lstVal).toFixed(1);
  lstRange.value = parseFloat(lstVal);
  lstReadout.textContent = `${parseFloat(lstVal).toFixed(1)}°C`;

  ndvi.value = parseFloat(ndviVal).toFixed(2);
  ndviRange.value = parseFloat(ndviVal);
  ndviReadout.textContent = parseFloat(ndviVal).toFixed(2);

  lulc.value = lulcVal;
  setGaugeFromTemp(parseFloat(lstVal));
}

// ==============================================================
// 8. REAL LANDSAT-8 SATELLITE CONTINUOUS THERMAL MAP (DELHI/NCR)
// ==============================================================

// Regional Hotspots across Delhi/NCR centered around NSUT / Dwarka
// Decoupled from the satellite raster rendering pipeline
const HOTSPOT_DEMO_DATA = [
  { id: "HS-01", districtId: "D-01", name: "NSUT Campus & Dwarka Institutional Core", lat: 28.6097, lon: 77.0374, lst: 41.5, ndvi: 0.28, lulc: 6, lulc_label: "Institutional / Built-up", risk: "MODERATE", zone: 3 },
  { id: "HS-02", districtId: "D-02", name: "Dwarka Sector 21 Multi-Modal Transit Hub", lat: 28.5522, lon: 77.0583, lst: 46.2, ndvi: 0.08, lulc: 6, lulc_label: "Transport Corridors / Built-up", risk: "EXTREME", zone: 5 },
  { id: "HS-03", districtId: "D-03", name: "IGI Airport Aerocity & Runway Tarmac", lat: 28.5562, lon: 77.1000, lst: 48.5, ndvi: 0.04, lulc: 6, lulc_label: "Asphalt / Commercial Hub", risk: "EXTREME", zone: 5 },
  { id: "HS-04", districtId: "D-04", name: "Central Delhi (Connaught Place Core)", lat: 28.6328, lon: 77.2197, lst: 46.8, ndvi: 0.07, lulc: 6, lulc_label: "Commercial Downtown Core", risk: "EXTREME", zone: 5 },
  { id: "HS-05", districtId: "D-05", name: "Okhla Phase-III Industrial Zone", lat: 28.5355, lon: 77.2710, lst: 47.9, ndvi: 0.05, lulc: 6, lulc_label: "Industrial Logistics Hub", risk: "EXTREME", zone: 5 },
  { id: "HS-06", districtId: "D-06", name: "Delhi Ridge Forest (Thermal Oasis Buffer)", lat: 28.5950, lon: 77.1700, lst: 33.2, ndvi: 0.71, lulc: 2, lulc_label: "Urban Forest Canopy", risk: "LOW", zone: 1 },
  { id: "HS-07", districtId: "D-07", name: "Yamuna River Corridor & Wetland Park", lat: 28.6150, lon: 77.2600, lst: 31.8, ndvi: 0.42, lulc: 1, lulc_label: "Water Body / Wetland", risk: "LOW", zone: 1 },
  { id: "HS-08", districtId: "D-08", name: "DLF Cyber City / Udyog Vihar (Gurugram)", lat: 28.4950, lon: 77.0890, lst: 47.1, ndvi: 0.06, lulc: 6, lulc_label: "Dense High-Rise Commercial", risk: "EXTREME", zone: 5 },
  { id: "HS-09", districtId: "D-09", name: "Noida Sector 62 Tech & Commercial Park", lat: 28.6250, lon: 77.3650, lst: 44.8, ndvi: 0.12, lulc: 6, lulc_label: "Commercial High-Density", risk: "HIGH", zone: 4 },
  { id: "HS-10", districtId: "D-10", name: "Rohini Urban Sector 11 (North Delhi)", lat: 28.7220, lon: 77.1180, lst: 43.6, ndvi: 0.16, lulc: 6, lulc_label: "Dense Residential", risk: "HIGH", zone: 4 },
];

let mapInstance = null;
let thermalRasterLayer = null;
let currentSelectedHotspot = HOTSPOT_DEMO_DATA[0];

// Real Landsat-8 scene calibrated geographic bounds (Delhi/NCR)
const SATELLITE_LST_BOUNDS = [
  [28.36, 76.82], // South-West (Gurugram/Faridabad)
  [28.88, 77.58]  // North-East (Rohini/Noida/Greater Noida)
];
const SATELLITE_LST_IMAGE_URL = '/static/delhi_ncr_landsat_lst.png';

let mapInitialized = false;
async function initThermalMap() {
  const mapElement = document.getElementById('map');
  if (!mapElement || typeof L === 'undefined' || mapInitialized) return;
  mapInitialized = true;

  // Retrieve CARTO API key from window config or static/config.json
  let cartoKey = window.CARTO_API_KEY || '';
  if (!cartoKey) {
    try {
      const cfgRes = await fetch('/static/config.json');
      if (cfgRes.ok) {
        const cfg = await cfgRes.json();
        cartoKey = cfg.CARTO_API_KEY || '';
      }
    } catch (e) {
      console.warn('Could not load /static/config.json:', e);
    }
  }

  // Initial focus: NSUT / Dwarka, Delhi
  const nsutCoords = [28.6097, 77.0374];
  const defaultZoom = 12;

  mapInstance = L.map('map', {
    center: nsutCoords,
    zoom: defaultZoom,
    zoomControl: true,
    attributionControl: true
  });

  // Layer 1: Dark-Matter Cartographic Basemap with CARTO API key
  const tileUrl = cartoKey
    ? `https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png?key=${encodeURIComponent(cartoKey)}`
    : 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';

  L.tileLayer(tileUrl, {
    maxZoom: 19,
    subdomains: 'abcd',
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions" target="_blank" rel="noopener noreferrer">CARTO</a> | Landsat-8 &copy; USGS/NASA via Microsoft Planetary Computer'
  }).addTo(mapInstance);

  // Layer 2: Real Continuous Landsat-8 Surface Temperature (LST) Raster
  try {
    thermalRasterLayer = L.imageOverlay(SATELLITE_LST_IMAGE_URL, SATELLITE_LST_BOUNDS, {
      opacity: 0.75,
      interactive: false,
      zIndex: 5
    }).addTo(mapInstance);

    // Opacity slider listener
    const opacitySlider = document.getElementById('thermal-opacity');
    const opacityReadout = document.getElementById('opacity-readout');
    if (opacitySlider) {
      opacitySlider.addEventListener('input', (e) => {
        const val = parseFloat(e.target.value);
        if (thermalRasterLayer) thermalRasterLayer.setOpacity(val);
        if (opacityReadout) opacityReadout.textContent = `${Math.round(val * 100)}%`;
      });
    }
  } catch (err) {
    console.warn('Real satellite raster overlay fallback:', err);
  }

  // Update HUD coordinates on pan/move
  mapInstance.on('mousemove', (e) => {
    if (hudMapCoords) {
      hudMapCoords.textContent = `LAT: ${e.latlng.lat.toFixed(4)}°N | LON: ${e.latlng.lng.toFixed(4)}°E`;
    }
  });

  // Recenter button (re-centers on NSUT)
  if (mapResetBtn) {
    mapResetBtn.addEventListener('click', () => {
      mapInstance.setView(nsutCoords, defaultZoom);
    });
  }

  // Layer 3: Tactical Hotspot Pins (Clickable telemetry targets)
  HOTSPOT_DEMO_DATA.forEach(hs => {
    const zColor = ZONE_COLORS[hs.zone] || '#ff4d4d';

    // Custom Tactical Marker Pin
    const customIcon = L.divIcon({
      className: 'custom-hotspot-pin',
      html: `
        <div class="pin-core" style="background:${zColor}; color:${zColor};">
          <div class="pin-pulse"></div>
        </div>
      `,
      iconSize: [20, 20],
      iconAnchor: [10, 10]
    });

    const marker = L.marker([hs.lat, hs.lon], { icon: customIcon, zIndexOffset: 50 }).addTo(mapInstance);

    // Popup Content with Landsat provenance note
    const popupHtml = `
      <div style="font-family:var(--font-mono); font-size:11px; padding:4px;">
        <div style="color:${zColor}; font-weight:700; margin-bottom:2px;">${hs.id} // ${hs.risk} RISK</div>
        <div style="font-size:12px; font-weight:700; color:#fff; margin-bottom:4px;">${hs.name}</div>
        <div>LST READOUT: <strong>${hs.lst}°C</strong> | NDVI: <strong>${hs.ndvi}</strong></div>
        <div style="color:#94a3b8; font-size:10px; margin-top:2px;">${hs.lulc_label}</div>
        <div style="color:var(--accent); font-size:9px; margin-top:4px; border-top:1px solid #334155; padding-top:2px;">
          🛰️ Landsat-8 Real Radiometric Field
        </div>
      </div>
    `;
    marker.bindPopup(popupHtml);

    // Click handler for Hotspot
    marker.on('click', () => {
      selectHotspot(hs);
      marker.openPopup();
    });
  });

  // Initialize with the first hotspot (NSUT Campus)
  selectHotspot(HOTSPOT_DEMO_DATA[0]);
}

function selectHotspot(hs) {
  currentSelectedHotspot = hs;

  if (telemetryHotspotId) telemetryHotspotId.textContent = `${hs.id} // SECTOR`;
  if (telemetrySectorName) telemetrySectorName.textContent = hs.name;
  if (telemetryLst) telemetryLst.textContent = hs.lst.toFixed(1);
  if (telemetryNdvi) telemetryNdvi.textContent = hs.ndvi.toFixed(2);
  if (telemetryLulc) telemetryLulc.textContent = hs.lulc_label;

  const zColor = ZONE_COLORS[hs.zone] || '#ff4d4d';
  if (telemetryZoneLabel) {
    telemetryZoneLabel.textContent = `Zone ${hs.zone}: ${hs.risk} Risk`;
    telemetryZoneLabel.style.color = zColor;
  }

  if (telemetryRiskBadge) {
    telemetryRiskBadge.textContent = `${hs.risk} RISK`;
    telemetryRiskBadge.style.color = zColor;
    telemetryRiskBadge.style.borderColor = `${zColor}66`;
    telemetryRiskBadge.style.background = `${zColor}18`;
  }
}

// "LOAD INTO DIAGNOSTICS" button in Hotspot Telemetry HUD
if (btnLoadHotspot) {
  btnLoadHotspot.addEventListener('click', () => {
    if (!currentSelectedHotspot) return;
    loadSiteParameters(
      currentSelectedHotspot.lst,
      currentSelectedHotspot.ndvi,
      currentSelectedHotspot.lulc
    );

    // Highlight button and run prediction
    predictBtn.click();

    // Smooth scroll down to diagnostics section
    const inputPanel = document.querySelector('.input-panel');
    if (inputPanel) {
      inputPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  });
}

// Initialize Map once DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  initThermalMap();
});
if (document.readyState === 'complete' || document.readyState === 'interactive') {
  initThermalMap();
}
