/**
 * VinoMemo — Aplicação Principal (Tomados + Adega Virtual Integrada + Nuvem Supabase)
 */

const SENSORY_LABELS = {
  body: ['Bem Leve', 'Leve', 'Médio', 'Encorpado', 'Bem Encorpado'],
  tannin: ['Não amarra', 'Bem Macio', 'Equilibrado', 'Amarra um pouco', 'Amarra bastante'],
  acidity: ['Suave', 'Leve frescor', 'Refrescante', 'Bem Fresco', 'Muito Refrescante'],
  sweetness: ['Seco (Zero doce)', 'Quase Seco', 'Levemente Adocicado', 'Suave / Doce', 'Bem Doce']
};

const state = {
  wines: [], // Contém tanto os 'tasted' (já tomados) quanto os 'cellar' (guardados na adega)
  currentView: 'catalog',
  filterType: 'all',
  filterRating: 0,
  filterRebuy: 'all',
  sortOrder: 'date_desc',
  searchQuery: '',
  cellarFilterType: 'all',
  cellarSearchQuery: '',
  currentLabelPhoto: '',
  currentMemoryPhoto: '',
  currentCellarLabelPhoto: '',
  editingCreatedAt: null
};

document.addEventListener('DOMContentLoaded', async () => {
  initTheme();
  initCloudStatusUI();
  bindEvents();
  await loadInitialData();
});

function isCellarWine(wine) {
  return wine && wine.status === 'cellar';
}

function getTastedWines() {
  return state.wines.filter((w) => !isCellarWine(w));
}

function getCellarWines() {
  return state.wines.filter((w) => isCellarWine(w));
}

function getNormalizedScore10(wine) {
  if (wine.score10 !== undefined && wine.score10 !== null && wine.score10 !== '') {
    return Number(wine.score10);
  }
  if (wine.score100 !== undefined && wine.score100 !== null && wine.score100 !== '') {
    return Number((Number(wine.score100) / 10).toFixed(1));
  }
  return null;
}

function initCloudStatusUI() {
  const btn = document.getElementById('btnCloudConfig');
  const label = document.getElementById('cloudStatusLabel');

  const updateBadge = (status, msg) => {
    btn.classList.remove('unconfigured', 'connected', 'syncing', 'error');
    btn.classList.add(status || 'unconfigured');
    if (status === 'connected') {
      label.textContent = '☁️ Nuvem Ativa';
      btn.title = msg || 'Sincronizado com o Banco na Nuvem';
    } else if (status === 'syncing') {
      label.textContent = '🔄 Sincronizando...';
      btn.title = msg || 'Sincronizando...';
    } else if (status === 'error') {
      label.textContent = '⚠️ Nuvem Offline';
      btn.title = msg || 'Erro ao conectar na nuvem';
    } else {
      label.textContent = '☁️ Conectar Nuvem';
      btn.title = 'Configurar Banco de Dados na Nuvem';
    }
  };

  window.wineDB.cloud.onStatusChange = updateBadge;
  updateBadge(window.wineDB.cloud.status);
}

async function loadInitialData() {
  try {
    let wines = await window.wineDB.getAllWines();
    const hasSeeded = localStorage.getItem('vinomemo_initial_seeded');

    if (wines.length === 0 && !hasSeeded) {
      const samples = window.getSampleWines();
      await window.wineDB.importMany(samples);
      localStorage.setItem('vinomemo_initial_seeded', 'true');
      wines = await window.wineDB.getAllWines();
      showToast('Bem-vindo ao VinoMemo! Carregamos exemplos nos Tomados e na sua Adega Virtual.');
    } else {
      // Se já tinha os 3 exemplos antigos mas ainda não tinha exemplo na Adega Virtual, adiciona 2 exemplos na Adega uma única vez
      const hasCellarSeeded = localStorage.getItem('vinomemo_cellar_seeded');
      if (!hasCellarSeeded && !wines.some((w) => w.status === 'cellar')) {
        const cellarSamples = window.getSampleWines().filter((w) => w.status === 'cellar');
        await window.wineDB.importMany(cellarSamples);
        localStorage.setItem('vinomemo_cellar_seeded', 'true');
        wines = await window.wineDB.getAllWines();
      }
    }

    state.wines = wines;
    refreshAllUI();
  } catch (err) {
    console.error('Erro ao carregar vinhos:', err);
    showToast('Erro ao acessar o banco de dados.');
  }
}

function refreshAllUI() {
  updateSummaryRibbon();
  renderCatalog();
  renderCellarView();
  renderMemoriesWall();
  renderStatsDashboard();
}

function switchToView(viewName) {
  state.currentView = viewName;
  document.querySelectorAll('.nav-tab').forEach((t) => {
    t.classList.toggle('active', t.dataset.view === viewName);
  });
  document.querySelectorAll('.view-section').forEach((sec) => sec.classList.remove('active'));
  if (viewName === 'catalog') document.getElementById('viewCatalog').classList.add('active');
  if (viewName === 'cellar') document.getElementById('viewCellar').classList.add('active');
  if (viewName === 'memories') document.getElementById('viewMemories').classList.add('active');
  if (viewName === 'stats') document.getElementById('viewStats').classList.add('active');
}

/* ==========================================
   SUMMARY RIBBON
========================================== */
function updateSummaryRibbon() {
  const tasted = getTastedWines();
  const cellar = getCellarWines();

  const totalTasted = tasted.length;
  const totalCellarBottles = cellar.reduce((acc, w) => acc + (Number(w.quantity) || 1), 0);

  document.getElementById('quickTotalWines').textContent = totalTasted;
  document.getElementById('quickCellarCount').textContent = totalCellarBottles;
  document.getElementById('navCellarBadge').textContent = totalCellarBottles;

  if (totalTasted === 0) {
    document.getElementById('quickAvgRating').textContent = '0.0 ★';
    document.getElementById('quickTopGrape').textContent = '—';
    return;
  }

  const avg = tasted.reduce((acc, w) => acc + (Number(w.rating) || 0), 0) / totalTasted;
  document.getElementById('quickAvgRating').textContent = avg.toFixed(1) + ' ★';

  const grapeCounts = {};
  tasted.forEach((w) => {
    if (!w.grapes) return;
    w.grapes.split(/[,/;&]+/).forEach((g) => {
      const clean = g.trim();
      if (clean) grapeCounts[clean] = (grapeCounts[clean] || 0) + 1;
    });
  });
  const topGrapeEntry = Object.entries(grapeCounts).sort((a, b) => b[1] - a[1])[0];
  document.getElementById('quickTopGrape').textContent = topGrapeEntry ? topGrapeEntry[0] : '—';
}

/* ==========================================
   VIEW 1: CATALOG (TASTED WINES)
========================================== */
function getFilteredAndSortedWines() {
  const q = state.searchQuery.trim().toLowerCase();
  const tastedWines = getTastedWines();

  const filtered = tastedWines.filter((w) => {
    if (state.filterType !== 'all' && w.type !== state.filterType) return false;
    if (state.filterRating > 0 && (Number(w.rating) || 0) < state.filterRating) return false;
    if (state.filterRebuy === 'yes' && !w.rebuy) return false;
    if (state.filterRebuy === 'withMoment' && !w.memoryPhoto) return false;

    if (q) {
      const haystack = [
        w.name,
        w.grapes,
        w.country,
        w.vintage,
        w.location,
        w.companions,
        w.occasion,
        w.pairing,
        w.notes
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      if (!haystack.includes(q)) return false;
    }

    return true;
  });

  filtered.sort((a, b) => {
    switch (state.sortOrder) {
      case 'date_desc':
        return (b.tastingDate || b.createdAt || '').localeCompare(a.tastingDate || a.createdAt || '');
      case 'date_asc':
        return (a.tastingDate || a.createdAt || '').localeCompare(b.tastingDate || b.createdAt || '');
      case 'rating_desc':
        return (Number(b.rating) || 0) - (Number(a.rating) || 0);
      case 'score_desc':
        return (getNormalizedScore10(b) || 0) - (getNormalizedScore10(a) || 0);
      case 'name_asc':
        return (a.name || '').localeCompare(b.name || '');
      case 'vintage_desc':
        return (parseInt(b.vintage) || 0) - (parseInt(a.vintage) || 0);
      default:
        return 0;
    }
  });

  return filtered;
}

function getTypeBadgeClass(type) {
  switch (type) {
    case 'Tinto': return 'badge-tinto';
    case 'Branco': return 'badge-branco';
    case 'Rosé': return 'badge-rose';
    case 'Espumante': return 'badge-espumante';
    case 'Sobremesa/Fortificado': return 'badge-fortificado';
    default: return 'badge-tinto';
  }
}

function formatDateBR(dateStr) {
  if (!dateStr) return 'Sem data';
  const parts = dateStr.split('-');
  if (parts.length !== 3) return dateStr;
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

function renderCatalog() {
  const grid = document.getElementById('wineGrid');
  const emptyState = document.getElementById('emptyState');
  const filtered = getFilteredAndSortedWines();
  const totalTasted = getTastedWines().length;

  if (filtered.length === 0) {
    grid.innerHTML = '';
    emptyState.classList.remove('hidden');
    const titleEl = document.getElementById('emptyStateTitle');
    const descEl = document.getElementById('emptyStateDesc');
    if (totalTasted > 0) {
      titleEl.textContent = 'Nenhum rótulo encontrado com esses filtros';
      descEl.textContent = 'Experimente limpar a busca ou selecionar "Todos" os tipos de vinho.';
    } else {
      titleEl.textContent = 'Nenhum vinho avaliado ainda';
      descEl.textContent = 'Avalie um vinho que você tomou ou escolha uma garrafa da sua Adega Virtual para abrir e avaliar!';
    }
    return;
  }

  emptyState.classList.add('hidden');

  grid.innerHTML = filtered
    .map((wine) => {
      const mainImg =
        wine.labelPhoto ||
        window.generateWineLabelIllustration({
          name: wine.name,
          grapes: wine.grapes,
          vintage: wine.vintage,
          type: wine.type,
          country: wine.country
        });

      const sensory = wine.sensory || { body: 3, tannin: 3, acidity: 3, sweetness: 1 };
      const score10 = getNormalizedScore10(wine);

      return `
      <article class="wine-card" data-id="${escapeHtml(wine.id)}">
        <div class="card-media">
          <img class="card-main-photo" src="${mainImg}" alt="${escapeHtml(wine.name)}" loading="lazy" />
          <div class="card-badges-top">
            <span class="badge-type ${getTypeBadgeClass(wine.type)}">${escapeHtml(wine.type)}</span>
            <span class="badge-rating-pill">
              ★ ${Number(wine.rating || 0).toFixed(1)}
              ${score10 !== null ? `<small style="opacity:0.9">• Nota ${score10}</small>` : ''}
            </span>
          </div>
          ${
            wine.memoryPhoto
              ? `
            <div class="card-moment-pip" title="Foto da lembrança do dia">
              <img src="${wine.memoryPhoto}" alt="Lembrança do dia" loading="lazy" />
              <span>Lembrança</span>
            </div>`
              : ''
          }
        </div>

        <div class="card-body">
          <div class="card-winery-row">
            <span>🌍 ${escapeHtml(wine.country || 'País não informado')}</span>
            <span>📅 ${escapeHtml(wine.vintage || 'Sem ano')}</span>
          </div>

          <h3 class="card-title">${escapeHtml(wine.name)}</h3>

          <div class="card-meta-tags">
            ${wine.grapes ? `<span class="meta-chip">🍇 ${escapeHtml(wine.grapes)}</span>` : ''}
            ${wine.country ? `<span class="meta-chip">🌍 ${escapeHtml(wine.country)}</span>` : ''}
            ${wine.vintage ? `<span class="meta-chip">📅 Ano ${escapeHtml(wine.vintage)}</span>` : ''}
          </div>

          <div class="card-sensory-mini" title="Como você sentiu o vinho">
            <div class="mini-stat">
              <span class="mini-stat-label">Corpo</span>
              <div class="mini-bar-track"><div class="mini-bar-fill" style="width:${(sensory.body / 5) * 100}%"></div></div>
            </div>
            <div class="mini-stat">
              <span class="mini-stat-label">Tanino</span>
              <div class="mini-bar-track"><div class="mini-bar-fill" style="width:${(sensory.tannin / 5) * 100}%"></div></div>
            </div>
            <div class="mini-stat">
              <span class="mini-stat-label">Frescor</span>
              <div class="mini-bar-track"><div class="mini-bar-fill" style="width:${(sensory.acidity / 5) * 100}%"></div></div>
            </div>
            <div class="mini-stat">
              <span class="mini-stat-label">Doçura</span>
              <div class="mini-bar-track"><div class="mini-bar-fill" style="width:${(sensory.sweetness / 5) * 100}%"></div></div>
            </div>
          </div>

          <p class="card-notes-excerpt">“${escapeHtml(wine.notes || 'Sem comentário registrado.')}”</p>

          <div class="card-memory-footer">
            <div class="memory-context">
              <span>📅 ${formatDateBR(wine.tastingDate)}</span>
              ${wine.companions ? `<span>• 👥 ${escapeHtml(wine.companions)}</span>` : ''}
              ${wine.location ? `<span>• 📌 ${escapeHtml(wine.location)}</span>` : ''}
            </div>
            ${wine.rebuy ? `<span class="rebuy-heart" title="Compraria novamente">♥ Favorito</span>` : ''}
          </div>
        </div>
      </article>
    `;
    })
    .join('');

  grid.querySelectorAll('.wine-card').forEach((card) => {
    card.addEventListener('click', () => {
      openWineDetailModal(card.dataset.id);
    });
  });
}

/* ==========================================
   VIEW 2: ADEGA VIRTUAL (CELLAR + MINI DASHBOARD)
========================================== */
function renderCellarMiniDashboard(allCellarWines) {
  const dash = document.getElementById('cellarMiniDashboard');
  if (!dash) return;

  if (allCellarWines.length === 0) {
    dash.classList.add('hidden');
    dash.innerHTML = '';
    return;
  }

  dash.classList.remove('hidden');

  const totalLabels = allCellarWines.length;
  const totalBottles = allCellarWines.reduce((acc, w) => acc + (Number(w.quantity) || 1), 0);

  // Contagem de garrafas por Tipo de Vinho
  const typeOrder = [
    { key: 'Tinto', label: '🍷 Tintos', segClass: 'seg-tinto', dotClass: 'dot-tinto' },
    { key: 'Branco', label: '🥂 Brancos', segClass: 'seg-branco', dotClass: 'dot-branco' },
    { key: 'Rosé', label: '🌸 Rosés', segClass: 'seg-rose', dotClass: 'dot-rose' },
    { key: 'Espumante', label: '🍾 Espumantes', segClass: 'seg-espumante', dotClass: 'dot-espumante' },
    { key: 'Sobremesa/Fortificado', label: '🍯 Licorosos', segClass: 'seg-fortificado', dotClass: 'dot-fortificado' }
  ];

  const bottlesByType = {};
  const bottlesByGrape = {};
  const bottlesByCountry = {};

  allCellarWines.forEach((w) => {
    const qty = Number(w.quantity) || 1;
    const t = w.type || 'Tinto';
    bottlesByType[t] = (bottlesByType[t] || 0) + qty;

    if (w.grapes) {
      w.grapes.split(/[,/;&]+/).forEach((g) => {
        const clean = g.trim();
        if (clean) bottlesByGrape[clean] = (bottlesByGrape[clean] || 0) + qty;
      });
    }

    if (w.country) {
      const c = w.country.trim();
      if (c) bottlesByCountry[c] = (bottlesByCountry[c] || 0) + qty;
    }
  });

  const grapeEntries = Object.entries(bottlesByGrape).sort((a, b) => b[1] - a[1]);
  const countryEntries = Object.entries(bottlesByCountry).sort((a, b) => b[1] - a[1]);

  const activeTypes = typeOrder.filter((t) => (bottlesByType[t.key] || 0) > 0);

  dash.innerHTML = `
    <div class="cellar-dash-top">
      <div class="cellar-stat-box">
        <span class="cellar-stat-num">${totalBottles}</span>
        <span class="cellar-stat-label">🍾 Garrafas em Casa</span>
      </div>
      <div class="cellar-stat-box">
        <span class="cellar-stat-num">${totalLabels}</span>
        <span class="cellar-stat-label">🏷️ Rótulos Diferentes</span>
      </div>
      <div class="cellar-stat-box">
        <span class="cellar-stat-num">${grapeEntries.length}</span>
        <span class="cellar-stat-label">🍇 Tipos de Uva</span>
      </div>
      <div class="cellar-stat-box">
        <span class="cellar-stat-num">${countryEntries.length}</span>
        <span class="cellar-stat-label">🌍 Países na Adega</span>
      </div>
    </div>

    <div class="cellar-type-breakdown">
      <span class="cellar-breakdown-title">📊 Composição da Sua Adega por Estilo</span>
      <div class="cellar-stacked-bar">
        ${activeTypes
          .map((t) => {
            const count = bottlesByType[t.key];
            const pct = Math.max(5, Math.round((count / totalBottles) * 100));
            return `<div class="stacked-segment ${t.segClass}" style="width:${pct}%" title="${t.label}: ${count} garrafa(s)"></div>`;
          })
          .join('')}
      </div>
      <div class="cellar-legend-pills">
        ${activeTypes
          .map((t) => {
            const count = bottlesByType[t.key];
            return `
              <span class="cellar-legend-item">
                <span class="dot ${t.dotClass}"></span>
                ${t.label}: <strong>${count}</strong>
              </span>
            `;
          })
          .join('')}
      </div>
    </div>

    <div class="cellar-highlights-row">
      <div class="cellar-highlight-group">
        <strong>🍇 Uvas prontas para abrir</strong>
        <div class="cellar-tags-wrap">
          ${
            grapeEntries.length
              ? grapeEntries
                  .map(
                    ([grape, qty]) =>
                      `<span class="meta-chip">${escapeHtml(grape)} <strong>(${qty})</strong></span>`
                  )
                  .join('')
              : '<span class="field-hint">Nenhuma uva informada</span>'
          }
        </div>
      </div>

      <div class="cellar-highlight-group">
        <strong>🌍 Países disponíveis em casa</strong>
        <div class="cellar-tags-wrap">
          ${
            countryEntries.length
              ? countryEntries
                  .map(
                    ([country, qty]) =>
                      `<span class="meta-chip">${escapeHtml(country)} <strong>(${qty})</strong></span>`
                  )
                  .join('')
              : '<span class="field-hint">Nenhum país informado</span>'
          }
        </div>
      </div>
    </div>
  `;
}

function renderCellarView() {
  const grid = document.getElementById('cellarGrid');
  const emptyState = document.getElementById('cellarEmptyState');
  const q = state.cellarSearchQuery.trim().toLowerCase();

  const allCellar = getCellarWines();
  renderCellarMiniDashboard(allCellar);

  const cellarWines = allCellar.filter((w) => {
    if (state.cellarFilterType !== 'all' && w.type !== state.cellarFilterType) return false;
    if (q) {
      const hay = [w.name, w.grapes, w.country, w.vintage, w.cellarObs].filter(Boolean).join(' ').toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  if (cellarWines.length === 0) {
    grid.innerHTML = '';
    emptyState.classList.remove('hidden');
    return;
  }

  emptyState.classList.add('hidden');

  grid.innerHTML = cellarWines
    .map((wine) => {
      const mainImg =
        wine.labelPhoto ||
        window.generateWineLabelIllustration({
          name: wine.name,
          grapes: wine.grapes,
          vintage: wine.vintage,
          type: wine.type,
          country: wine.country
        });
      const qty = Number(wine.quantity) || 1;

      return `
      <article class="wine-card cellar-card" data-id="${escapeHtml(wine.id)}" style="cursor:default;">
        <div class="card-media">
          <img class="card-main-photo" src="${mainImg}" alt="${escapeHtml(wine.name)}" loading="lazy" />
          <div class="card-badges-top">
            <span class="badge-type ${getTypeBadgeClass(wine.type)}">${escapeHtml(wine.type)}</span>
            <span class="cellar-qty-badge">🍾 ${qty} ${qty === 1 ? 'garrafa' : 'garrafas'}</span>
          </div>
        </div>

        <div class="card-body">
          <div class="card-winery-row">
            <span>🌍 ${escapeHtml(wine.country || 'País não informado')}</span>
            <span>📅 ${escapeHtml(wine.vintage || 'Sem safra')}</span>
          </div>

          <h3 class="card-title">${escapeHtml(wine.name)}</h3>

          <div class="card-meta-tags">
            ${wine.grapes ? `<span class="meta-chip">🍇 ${escapeHtml(wine.grapes)}</span>` : ''}
            ${wine.country ? `<span class="meta-chip">🌍 ${escapeHtml(wine.country)}</span>` : ''}
            ${wine.vintage ? `<span class="meta-chip">📅 Ano ${escapeHtml(wine.vintage)}</span>` : ''}
          </div>

          ${
            wine.cellarObs
              ? `<p class="card-notes-excerpt" style="font-style:normal; color:var(--text-muted);">📌 ${escapeHtml(wine.cellarObs)}</p>`
              : ''
          }

          <div class="cellar-card-footer">
            <div class="cellar-qty-controls">
              <span>Estoque em casa:</span>
              <div class="qty-stepper">
                <button type="button" class="qty-btn btn-qty-minus" data-id="${escapeHtml(wine.id)}" title="Diminuir 1">-</button>
                <strong>${qty}</strong>
                <button type="button" class="qty-btn btn-qty-plus" data-id="${escapeHtml(wine.id)}" title="Adicionar +1">+</button>
              </div>
            </div>

            <div class="cellar-action-row">
              <button type="button" class="btn-drink-evaluate" data-id="${escapeHtml(wine.id)}">
                🍷 Tomei! Avaliar agora
              </button>
              <button type="button" class="btn-secondary btn-sm btn-edit-cellar" data-id="${escapeHtml(wine.id)}" title="Editar dados da garrafa">
                ✎
              </button>
              <button type="button" class="btn-secondary btn-sm btn-delete-cellar" data-id="${escapeHtml(wine.id)}" title="Remover da adega">
                🗑️
              </button>
            </div>
          </div>
        </div>
      </article>
    `;
    })
    .join('');

  // Bind buttons on Cellar cards
  grid.querySelectorAll('.btn-drink-evaluate').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const wine = state.wines.find((w) => w.id === btn.dataset.id);
      if (wine) openEvaluateFromCellarModal(wine);
    });
  });

  grid.querySelectorAll('.btn-edit-cellar').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const wine = state.wines.find((w) => w.id === btn.dataset.id);
      if (wine) openCellarFormModal(wine);
    });
  });

  grid.querySelectorAll('.btn-delete-cellar').forEach((btn) => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const wine = state.wines.find((w) => w.id === btn.dataset.id);
      if (wine && confirm(`Remover "${wine.name}" da sua Adega Virtual?`)) {
        await window.wineDB.deleteWine(wine.id);
        state.wines = await window.wineDB.getAllWines();
        refreshAllUI();
        showToast('Garrafa removida da Adega Virtual.');
      }
    });
  });

  grid.querySelectorAll('.btn-qty-plus').forEach((btn) => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const wine = state.wines.find((w) => w.id === btn.dataset.id);
      if (!wine) return;
      wine.quantity = (Number(wine.quantity) || 1) + 1;
      await window.wineDB.saveWine(wine);
      state.wines = await window.wineDB.getAllWines();
      refreshAllUI();
    });
  });

  grid.querySelectorAll('.btn-qty-minus').forEach((btn) => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const wine = state.wines.find((w) => w.id === btn.dataset.id);
      if (!wine) return;
      const currentQty = Number(wine.quantity) || 1;
      if (currentQty <= 1) {
        if (confirm(`Você tem 1 garrafa de "${wine.name}". Deseja avaliá-lo como tomado ou removê-lo da adega? Clique em OK para avaliar!`)) {
          openEvaluateFromCellarModal(wine);
        }
        return;
      }
      wine.quantity = currentQty - 1;
      await window.wineDB.saveWine(wine);
      state.wines = await window.wineDB.getAllWines();
      refreshAllUI();
    });
  });
}

/* ==========================================
   VIEW 3: MEMORIES POLAROID WALL
========================================== */
function renderMemoriesWall() {
  const container = document.getElementById('memoriesGrid');
  const tasted = getTastedWines();

  if (tasted.length === 0) {
    container.innerHTML = `
      <div class="empty-state" style="grid-column: 1 / -1;">
        <h2>Nenhuma lembrança registrada ainda</h2>
        <p>Ao avaliar um vinho, coloque uma Foto do Dia, com quem você estava e o lugar para montar seu mural de recordações.</p>
      </div>
    `;
    return;
  }

  const sortedByDate = [...tasted].sort((a, b) =>
    (b.tastingDate || b.createdAt || '').localeCompare(a.tastingDate || a.createdAt || '')
  );

  container.innerHTML = sortedByDate
    .map((wine) => {
      const photo =
        wine.memoryPhoto ||
        wine.labelPhoto ||
        window.generateWineLabelIllustration({
          name: wine.name,
          grapes: wine.grapes,
          vintage: wine.vintage,
          type: wine.type,
          country: wine.country
        });

      return `
      <div class="polaroid-card" data-id="${escapeHtml(wine.id)}">
        <div class="polaroid-photo-frame">
          <img src="${photo}" alt="Memória com ${escapeHtml(wine.name)}" loading="lazy" />
          <span class="polaroid-date-stamp">${formatDateBR(wine.tastingDate)}</span>
        </div>
        <h3 class="polaroid-caption-title">${escapeHtml(wine.occasion || wine.location || wine.name)}</h3>
        <div class="polaroid-meta">
          <span>🍷 <strong>${escapeHtml(wine.name)}</strong> ${wine.vintage ? `(${escapeHtml(wine.vintage)})` : ''}</span>
          ${wine.companions ? `<span>• 👥 ${escapeHtml(wine.companions)}</span>` : ''}
          ${wine.location ? `<span>• 📍 ${escapeHtml(wine.location)}</span>` : ''}
          ${wine.pairing ? `<span>• 🍽️ ${escapeHtml(wine.pairing)}</span>` : ''}
        </div>
        <div class="polaroid-quote">
          “${escapeHtml((wine.notes || '').slice(0, 160))}${(wine.notes || '').length > 160 ? '...' : ''}”
        </div>
      </div>
    `;
    })
    .join('');

  container.querySelectorAll('.polaroid-card').forEach((card) => {
    card.addEventListener('click', () => openWineDetailModal(card.dataset.id));
  });
}

/* ==========================================
   VIEW 4: STATISTICS & PALATE PROFILE
========================================== */
function renderStatsDashboard() {
  const container = document.getElementById('statsContent');
  const wines = getTastedWines();
  const cellarWines = getCellarWines();
  const totalCellarBottles = cellarWines.reduce((acc, w) => acc + (Number(w.quantity) || 1), 0);

  if (wines.length === 0) {
    container.innerHTML = `
      <div class="empty-state span-12">
        <h2>Avalie seus rótulos para descobrir o seu gosto</h2>
        <p>Você tem <strong>${totalCellarBottles} garrafa(s)</strong> guardadas na sua Adega Virtual. Conforme avaliar os vinhos tomados, mostraremos quais uvas, países e estilos você mais gosta.</p>
      </div>
    `;
    return;
  }

  const total = wines.length;
  const avgRating = wines.reduce((acc, w) => acc + (Number(w.rating) || 0), 0) / total;
  const winesWithScore10 = wines.map((w) => getNormalizedScore10(w)).filter((v) => v !== null);
  const avgScore10 =
    winesWithScore10.length > 0
      ? winesWithScore10.reduce((acc, v) => acc + v, 0) / winesWithScore10.length
      : null;
  const favCount = wines.filter((w) => w.rebuy).length;

  const avgSensory = { body: 0, tannin: 0, acidity: 0, sweetness: 0 };
  wines.forEach((w) => {
    const s = w.sensory || { body: 3, tannin: 3, acidity: 3, sweetness: 1 };
    avgSensory.body += Number(s.body) || 3;
    avgSensory.tannin += Number(s.tannin) || 3;
    avgSensory.acidity += Number(s.acidity) || 3;
    avgSensory.sweetness += Number(s.sweetness) || 1;
  });
  Object.keys(avgSensory).forEach((k) => {
    avgSensory[k] = (avgSensory[k] / total).toFixed(1);
  });

  const byType = countOccurrences(wines.map((w) => w.type || 'Tinto'));

  const allGrapes = [];
  wines.forEach((w) => {
    if (w.grapes) {
      w.grapes.split(/[,/;&]+/).forEach((g) => {
        const clean = g.trim();
        if (clean) allGrapes.push(clean);
      });
    }
  });
  const topGrapes = countOccurrences(allGrapes).slice(0, 6);
  const topCountries = countOccurrences(wines.map((w) => w.country).filter(Boolean)).slice(0, 6);

  container.innerHTML = `
    <div class="kpi-cards-row">
      <div class="kpi-card">
        <span class="kpi-num">${total}</span>
        <span class="kpi-title">Vinhos Avaliados</span>
      </div>
      <div class="kpi-card">
        <span class="kpi-num">${totalCellarBottles}</span>
        <span class="kpi-title">Garrafas na Adega Virtual</span>
      </div>
      <div class="kpi-card">
        <span class="kpi-num">${avgScore10 !== null ? `${avgScore10.toFixed(1)} / 10` : `${avgRating.toFixed(1)} ★`}</span>
        <span class="kpi-title">Nota Pessoal Média</span>
      </div>
      <div class="kpi-card">
        <span class="kpi-num">${favCount}</span>
        <span class="kpi-title">Compraria Novamente (♥)</span>
      </div>
    </div>

    <div class="stat-panel span-6">
      <h3>🧭 Como é o seu Paladar? (Média dos seus vinhos)</h3>
      <div class="bar-list">
        ${renderStatBar('💧 Peso na Boca (Corpo)', `${avgSensory.body} de 5`, (avgSensory.body / 5) * 100)}
        ${renderStatBar('👅 Sensação de Amarrar (Tanino)', `${avgSensory.tannin} de 5`, (avgSensory.tannin / 5) * 100)}
        ${renderStatBar('🍋 Refrescância (Acidez)', `${avgSensory.acidity} de 5`, (avgSensory.acidity / 5) * 100)}
        ${renderStatBar('🍯 Doçura', `${avgSensory.sweetness} de 5`, (avgSensory.sweetness / 5) * 100)}
      </div>
    </div>

    <div class="stat-panel span-6">
      <h3>🍷 Estilos que você mais tomou</h3>
      <div class="bar-list">
        ${byType.map(([label, count]) => renderStatBar(label, `${count} vinho(s)`, (count / total) * 100)).join('')}
      </div>
    </div>

    <div class="stat-panel span-6">
      <h3>🍇 Tipos de Uva Favoritos</h3>
      <div class="bar-list">
        ${
          topGrapes.length
            ? topGrapes.map(([label, count]) => renderStatBar(label, `${count}x`, (count / topGrapes[0][1]) * 100)).join('')
            : '<p style="color:var(--text-muted)">Nenhuma uva informada ainda.</p>'
        }
      </div>
    </div>

    <div class="stat-panel span-6">
      <h3>🌍 Países que você mais provou</h3>
      <div class="bar-list">
        ${
          topCountries.length
            ? topCountries.map(([label, count]) => renderStatBar(label, `${count}x`, (count / topCountries[0][1]) * 100)).join('')
            : '<p style="color:var(--text-muted)">Nenhum país informado ainda.</p>'
        }
      </div>
    </div>
  `;
}

function renderStatBar(label, rightText, percent) {
  return `
    <div class="bar-row">
      <div class="bar-row-header">
        <span>${escapeHtml(label)}</span>
        <span>${escapeHtml(rightText)}</span>
      </div>
      <div class="bar-track">
        <div class="bar-fill" style="width: ${Math.min(100, Math.max(6, percent))}%"></div>
      </div>
    </div>
  `;
}

function countOccurrences(arr) {
  const counts = {};
  arr.forEach((item) => {
    counts[item] = (counts[item] || 0) + 1;
  });
  return Object.entries(counts).sort((a, b) => b[1] - a[1]);
}

/* ==========================================
   DETAIL MODAL (FOR TASTED WINES)
========================================== */
function openWineDetailModal(wineId) {
  const wine = state.wines.find((w) => w.id === wineId);
  if (!wine) return;

  const modal = document.getElementById('wineDetailModal');
  const content = document.getElementById('wineDetailContent');

  const labelImg =
    wine.labelPhoto ||
    window.generateWineLabelIllustration({
      name: wine.name,
      grapes: wine.grapes,
      vintage: wine.vintage,
      type: wine.type,
      country: wine.country
    });

  const hasBothPhotos = Boolean(wine.memoryPhoto);
  const sensory = wine.sensory || { body: 3, tannin: 3, acidity: 3, sweetness: 1 };
  const score10 = getNormalizedScore10(wine);

  content.innerHTML = `
    <div class="modal-header">
      <div>
        <span class="modal-eyebrow">${escapeHtml(wine.type)} ${wine.country ? `• ${escapeHtml(wine.country)}` : ''}</span>
        <h2>${escapeHtml(wine.name)}</h2>
      </div>
      <button type="button" class="modal-close" id="btnCloseDetailModal">&times;</button>
    </div>

    <div class="detail-hero">
      <div class="detail-photos-showcase">
        <div class="showcase-box ${hasBothPhotos ? '' : 'SinglePhoto'}">
          <img src="${labelImg}" alt="Foto do Rótulo" />
          <span class="showcase-caption">🍾 Rótulo da Garrafa</span>
        </div>
        ${
          hasBothPhotos
            ? `
          <div class="showcase-box">
            <img src="${wine.memoryPhoto}" alt="Foto da Lembrança do Dia" />
            <span class="showcase-caption">📸 Lembrança do Dia</span>
          </div>`
            : ''
        }
      </div>

      <div class="detail-main-info">
        <div class="detail-rating-bar">
          <span class="detail-stars">${'★'.repeat(Math.round(wine.rating || 0))} ${Number(wine.rating || 0).toFixed(1)} / 5.0</span>
          ${score10 !== null ? `<span class="detail-score100">Nota ${score10} / 10</span>` : ''}
          ${wine.rebuy ? `<span class="meta-chip" style="color:var(--wine-primary); font-weight:700;">♥ Compraria novamente</span>` : ''}
        </div>

        <div class="detail-specs-grid">
          <div class="spec-item">
            <span class="spec-label">🍷 Tipo do Vinho</span>
            <span class="spec-value">${escapeHtml(wine.type || '—')}</span>
          </div>
          <div class="spec-item">
            <span class="spec-label">🍇 Tipo de Uva</span>
            <span class="spec-value">${escapeHtml(wine.grapes || '—')}</span>
          </div>
          <div class="spec-item">
            <span class="spec-label">🌍 País</span>
            <span class="spec-value">${escapeHtml(wine.country || '—')}</span>
          </div>
          <div class="spec-item">
            <span class="spec-label">📅 Ano (Safra)</span>
            <span class="spec-value">${escapeHtml(wine.vintage || '—')}</span>
          </div>
        </div>
      </div>
    </div>

    <div class="detail-body">
      <div class="detail-memory-banner">
        <h4>✨ Lembrança do Dia &amp; Sua Opinião</h4>
        <div class="memory-facts">
          <span>📅 <strong>Data:</strong> ${formatDateBR(wine.tastingDate)}</span>
          ${wine.location ? `<span>📍 <strong>Onde:</strong> ${escapeHtml(wine.location)}</span>` : ''}
          ${wine.companions ? `<span>👥 <strong>Com quem:</strong> ${escapeHtml(wine.companions)}</span>` : ''}
          ${wine.occasion ? `<span>🎉 <strong>Ocasião:</strong> ${escapeHtml(wine.occasion)}</span>` : ''}
          ${wine.pairing ? `<span>🍽️ <strong>O que comeu:</strong> ${escapeHtml(wine.pairing)}</span>` : ''}
        </div>
        <p class="detail-notes-text">${escapeHtml(wine.notes || '')}</p>
      </div>

      <div>
        <h4 style="font-family:var(--font-serif); font-size:1.3rem; margin-bottom:0.75rem;">Como você sentiu esse vinho na boca</h4>
        <div class="sensory-sliders-grid">
          ${renderDetailSensoryBar('💧 Peso na Boca (Corpo)', SENSORY_LABELS.body[(sensory.body || 3) - 1], sensory.body || 3)}
          ${renderDetailSensoryBar('👅 Sensação de Amarrar (Tanino)', SENSORY_LABELS.tannin[(sensory.tannin || 3) - 1], sensory.tannin || 3)}
          ${renderDetailSensoryBar('🍋 Refrescância (Acidez)', SENSORY_LABELS.acidity[(sensory.acidity || 3) - 1], sensory.acidity || 3)}
          ${renderDetailSensoryBar('🍯 Doçura', SENSORY_LABELS.sweetness[(sensory.sweetness || 1) - 1], sensory.sweetness || 1)}
        </div>
      </div>

      <div class="detail-actions">
        <button type="button" class="btn-danger" id="btnDeleteWine">Excluir</button>
        <div style="display:flex; gap:0.65rem;">
          <button type="button" class="btn-secondary" id="btnCloseDetailBottom">Fechar</button>
          <button type="button" class="btn-primary" id="btnEditWine">✎ Editar Registro</button>
        </div>
      </div>
    </div>
  `;

  modal.classList.remove('hidden');

  document.getElementById('btnCloseDetailModal').onclick = () => modal.classList.add('hidden');
  document.getElementById('btnCloseDetailBottom').onclick = () => modal.classList.add('hidden');

  document.getElementById('btnEditWine').onclick = () => {
    modal.classList.add('hidden');
    openWineFormModal(wine);
  };

  document.getElementById('btnDeleteWine').onclick = async () => {
    if (confirm(`Deseja realmente excluir "${wine.name}" do seu diário?`)) {
      await window.wineDB.deleteWine(wine.id);
      state.wines = await window.wineDB.getAllWines();
      modal.classList.add('hidden');
      refreshAllUI();
      showToast('Rótulo removido do diário.');
    }
  };
}

function renderDetailSensoryBar(name, desc, val) {
  return `
    <div class="sensory-slider-item">
      <div class="sensory-slider-header">
        <label>${escapeHtml(name)}</label>
        <span class="sensory-val-label">${escapeHtml(desc)} (${val}/5)</span>
      </div>
      <div class="bar-track" style="height:8px;">
        <div class="bar-fill" style="width:${(val / 5) * 100}%"></div>
      </div>
    </div>
  `;
}

/* ==========================================
   ADEGA VIRTUAL FORM MODAL (GUARDAR EM CASA)
========================================== */
function openCellarFormModal(wine = null) {
  const modal = document.getElementById('cellarFormModal');
  const form = document.getElementById('cellarForm');
  form.reset();

  if (wine) {
    document.getElementById('cellarModalEyebrow').textContent = 'Editar Garrafa da Adega';
    document.getElementById('cellarModalTitle').textContent = wine.name;
    document.getElementById('cellarWineId').value = wine.id;
    state.editingCreatedAt = wine.createdAt || null;

    document.getElementById('cellarWineName').value = wine.name || '';
    document.getElementById('cellarWineType').value = wine.type || 'Tinto';
    document.getElementById('cellarWineGrapes').value = wine.grapes || '';
    document.getElementById('cellarWineCountry').value = wine.country || '';
    document.getElementById('cellarWineVintage').value = wine.vintage || '';
    document.getElementById('cellarWineQty').value = wine.quantity || 1;
    document.getElementById('cellarWineObs').value = wine.cellarObs || '';
    setPhotoPreview('cellarLabel', wine.labelPhoto || '');
  } else {
    document.getElementById('cellarModalEyebrow').textContent = '🏠 Minha Adega em Casa';
    document.getElementById('cellarModalTitle').textContent = 'Guardar Vinho na Adega Virtual';
    document.getElementById('cellarWineId').value = '';
    state.editingCreatedAt = null;
    document.getElementById('cellarWineQty').value = 1;
    setPhotoPreview('cellarLabel', '');
  }

  modal.classList.remove('hidden');
}

/* ==========================================
   INTEGRATION: ABRIR GARRAFA DA ADEGA -> AVALIAR
========================================== */
function openEvaluateFromCellarModal(cellarWine) {
  const modal = document.getElementById('wineFormModal');
  const form = document.getElementById('wineForm');
  form.reset();

  document.getElementById('formModalEyebrow').textContent = '🍷 Da Adega Virtual para Avaliação';
  document.getElementById('formModalTitle').textContent = `Avaliar: ${cellarWine.name}`;
  document.getElementById('wineId').value = '';
  document.getElementById('fromCellarWineId').value = cellarWine.id;
  document.getElementById('fromCellarBanner').classList.remove('hidden');
  state.editingCreatedAt = null;

  // Preenche todos os dados cadastrados na Adega Virtual automaticamente!
  document.getElementById('wineName').value = cellarWine.name || '';
  document.getElementById('wineType').value = cellarWine.type || 'Tinto';
  document.getElementById('wineGrapes').value = cellarWine.grapes || '';
  document.getElementById('wineCountry').value = cellarWine.country || '';
  document.getElementById('wineVintage').value = cellarWine.vintage || '';

  // Valores iniciais padrão para avaliação
  document.getElementById('sensoryBody').value = 3;
  document.getElementById('sensoryTannin').value = 3;
  document.getElementById('sensoryAcidity').value = 3;
  document.getElementById('sensorySweetness').value = 1;
  document.getElementById('wineRating').value = 4.5;
  updateStarPickerUI(4.5);
  document.getElementById('wineScore10').value = '9.0';
  document.getElementById('wineRebuy').checked = true;
  document.getElementById('tastingDate').value = new Date().toISOString().slice(0, 10);

  setPhotoPreview('label', cellarWine.labelPhoto || '');
  setPhotoPreview('memory', '');

  updateSensoryLabelsUI();
  modal.classList.remove('hidden');
}

/* ==========================================
   ADD / EDIT TASTED WINE MODAL
========================================== */
function openWineFormModal(wine = null) {
  const modal = document.getElementById('wineFormModal');
  const form = document.getElementById('wineForm');
  form.reset();

  document.getElementById('fromCellarWineId').value = '';
  document.getElementById('fromCellarBanner').classList.add('hidden');

  if (wine) {
    document.getElementById('formModalEyebrow').textContent = 'Editar Avaliação';
    document.getElementById('formModalTitle').textContent = wine.name;
    document.getElementById('wineId').value = wine.id;
    state.editingCreatedAt = wine.createdAt || null;

    document.getElementById('wineName').value = wine.name || '';
    document.getElementById('wineType').value = wine.type || 'Tinto';
    document.getElementById('wineVintage').value = wine.vintage || '';
    document.getElementById('wineGrapes').value = wine.grapes || '';
    document.getElementById('wineCountry').value = wine.country || '';

    const s = wine.sensory || { body: 3, tannin: 3, acidity: 3, sweetness: 1 };
    document.getElementById('sensoryBody').value = s.body || 3;
    document.getElementById('sensoryTannin').value = s.tannin || 3;
    document.getElementById('sensoryAcidity').value = s.acidity || 3;
    document.getElementById('sensorySweetness').value = s.sweetness || 1;

    const ratingVal = Number(wine.rating) || 4.5;
    document.getElementById('wineRating').value = ratingVal;
    updateStarPickerUI(ratingVal);

    const score10 = getNormalizedScore10(wine);
    document.getElementById('wineScore10').value = score10 !== null ? score10 : '';
    document.getElementById('wineRebuy').checked = Boolean(wine.rebuy);

    document.getElementById('tastingDate').value = wine.tastingDate || new Date().toISOString().slice(0, 10);
    document.getElementById('tastingLocation').value = wine.location || '';
    document.getElementById('tastingCompanions').value = wine.companions || '';
    document.getElementById('tastingPairing').value = wine.pairing || '';
    document.getElementById('tastingOccasion').value = wine.occasion || '';
    document.getElementById('wineNotes').value = wine.notes || '';

    setPhotoPreview('label', wine.labelPhoto || '');
    setPhotoPreview('memory', wine.memoryPhoto || '');
  } else {
    document.getElementById('formModalEyebrow').textContent = 'Simples & Didático';
    document.getElementById('formModalTitle').textContent = 'Avaliar Vinho Tomado & Lembrança';
    document.getElementById('wineId').value = '';
    state.editingCreatedAt = null;
    document.getElementById('tastingDate').value = new Date().toISOString().slice(0, 10);
    document.getElementById('wineRating').value = 4.5;
    updateStarPickerUI(4.5);
    setPhotoPreview('label', '');
    setPhotoPreview('memory', '');
  }

  updateSensoryLabelsUI();
  modal.classList.remove('hidden');
}

function setPhotoPreview(kind, dataUrl) {
  if (kind === 'label') {
    state.currentLabelPhoto = dataUrl || '';
    const previewContainer = document.getElementById('previewLabelContainer');
    const placeholder = document.getElementById('placeholderLabel');
    const img = document.getElementById('previewLabelImg');
    if (dataUrl) {
      img.src = dataUrl;
      previewContainer.classList.remove('hidden');
      placeholder.classList.add('hidden');
    } else {
      img.src = '';
      previewContainer.classList.add('hidden');
      placeholder.classList.remove('hidden');
    }
  } else if (kind === 'memory') {
    state.currentMemoryPhoto = dataUrl || '';
    const previewContainer = document.getElementById('previewMemoryContainer');
    const placeholder = document.getElementById('placeholderMemory');
    const img = document.getElementById('previewMemoryImg');
    if (dataUrl) {
      img.src = dataUrl;
      previewContainer.classList.remove('hidden');
      placeholder.classList.add('hidden');
    } else {
      img.src = '';
      previewContainer.classList.add('hidden');
      placeholder.classList.remove('hidden');
    }
  } else if (kind === 'cellarLabel') {
    state.currentCellarLabelPhoto = dataUrl || '';
    const previewContainer = document.getElementById('previewCellarLabelContainer');
    const placeholder = document.getElementById('placeholderCellarLabel');
    const img = document.getElementById('previewCellarLabelImg');
    if (dataUrl) {
      img.src = dataUrl;
      previewContainer.classList.remove('hidden');
      placeholder.classList.add('hidden');
    } else {
      img.src = '';
      previewContainer.classList.add('hidden');
      placeholder.classList.remove('hidden');
    }
  }
}

function updateSensoryLabelsUI() {
  const b = Number(document.getElementById('sensoryBody').value);
  const t = Number(document.getElementById('sensoryTannin').value);
  const a = Number(document.getElementById('sensoryAcidity').value);
  const s = Number(document.getElementById('sensorySweetness').value);

  document.getElementById('labelBody').textContent = `${SENSORY_LABELS.body[b - 1]} (${b}/5)`;
  document.getElementById('labelTannin').textContent = `${SENSORY_LABELS.tannin[t - 1]} (${t}/5)`;
  document.getElementById('labelAcidity').textContent = `${SENSORY_LABELS.acidity[a - 1]} (${a}/5)`;
  document.getElementById('labelSweetness').textContent = `${SENSORY_LABELS.sweetness[s - 1]} (${s}/5)`;
}

function updateStarPickerUI(val) {
  const num = Number(val);
  document.getElementById('ratingNumberDisplay').textContent = num.toFixed(1);
  document.querySelectorAll('#starPicker .star-btn').forEach((btn) => {
    const starVal = Number(btn.dataset.star);
    if (starVal <= Math.round(num)) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });
}

/* ==========================================
   EVENT BINDINGS
========================================== */
function bindEvents() {
  document.querySelectorAll('.nav-tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      switchToView(tab.dataset.view);
    });
  });

  // Open Tasted Wine Form
  document.getElementById('btnNewWine').addEventListener('click', () => openWineFormModal(null));
  document.getElementById('btnEmptyAdd').addEventListener('click', () => openWineFormModal(null));
  document.getElementById('btnEmptyGoCellar').addEventListener('click', () => switchToView('cellar'));

  // Open Cellar Wine Form
  document.getElementById('btnOpenCellarFormTop').addEventListener('click', () => openCellarFormModal(null));
  document.getElementById('btnAddCellarWine').addEventListener('click', () => openCellarFormModal(null));
  document.getElementById('btnCellarEmptyAdd').addEventListener('click', () => openCellarFormModal(null));

  document.getElementById('btnCloseCellarModal').addEventListener('click', () => {
    document.getElementById('cellarFormModal').classList.add('hidden');
  });
  document.getElementById('btnCancelCellarForm').addEventListener('click', () => {
    document.getElementById('cellarFormModal').classList.add('hidden');
  });

  // Load Sample Wines
  const handleLoadSamples = async () => {
    const samples = window.getSampleWines();
    await window.wineDB.importMany(samples);
    state.wines = await window.wineDB.getAllWines();
    refreshAllUI();
    document.getElementById('backupModal').classList.add('hidden');
    showToast('Exemplos restaurados nos Tomados e na Adega Virtual!');
  };
  document.getElementById('btnLoadSamplesFromBackup').addEventListener('click', handleLoadSamples);

  document.getElementById('btnCloseFormModal').addEventListener('click', () => {
    document.getElementById('wineFormModal').classList.add('hidden');
  });
  document.getElementById('btnCancelForm').addEventListener('click', () => {
    document.getElementById('wineFormModal').classList.add('hidden');
  });

  // Photo Uploaders (Tasted Modal)
  const inputLabel = document.getElementById('inputLabelPhoto');
  const dropzoneLabel = document.getElementById('dropzoneLabel');
  dropzoneLabel.addEventListener('click', (e) => {
    if (e.target.id === 'btnRemoveLabelPhoto') return;
    inputLabel.click();
  });
  inputLabel.addEventListener('change', async (e) => {
    if (e.target.files && e.target.files[0]) {
      const compressed = await window.compressImageFile(e.target.files[0]);
      setPhotoPreview('label', compressed);
    }
  });
  document.getElementById('btnRemoveLabelPhoto').addEventListener('click', (e) => {
    e.stopPropagation();
    inputLabel.value = '';
    setPhotoPreview('label', '');
  });

  const inputMemory = document.getElementById('inputMemoryPhoto');
  const dropzoneMemory = document.getElementById('dropzoneMemory');
  dropzoneMemory.addEventListener('click', (e) => {
    if (e.target.id === 'btnRemoveMemoryPhoto') return;
    inputMemory.click();
  });
  inputMemory.addEventListener('change', async (e) => {
    if (e.target.files && e.target.files[0]) {
      const compressed = await window.compressImageFile(e.target.files[0]);
      setPhotoPreview('memory', compressed);
    }
  });
  document.getElementById('btnRemoveMemoryPhoto').addEventListener('click', (e) => {
    e.stopPropagation();
    inputMemory.value = '';
    setPhotoPreview('memory', '');
  });

  // Photo Uploader (Cellar Modal)
  const inputCellarLabel = document.getElementById('inputCellarLabelPhoto');
  const dropzoneCellarLabel = document.getElementById('dropzoneCellarLabel');
  dropzoneCellarLabel.addEventListener('click', (e) => {
    if (e.target.id === 'btnRemoveCellarLabelPhoto') return;
    inputCellarLabel.click();
  });
  inputCellarLabel.addEventListener('change', async (e) => {
    if (e.target.files && e.target.files[0]) {
      const compressed = await window.compressImageFile(e.target.files[0]);
      setPhotoPreview('cellarLabel', compressed);
    }
  });
  document.getElementById('btnRemoveCellarLabelPhoto').addEventListener('click', (e) => {
    e.stopPropagation();
    inputCellarLabel.value = '';
    setPhotoPreview('cellarLabel', '');
  });

  // Save Cellar Form Submit (Guardar na Adega Virtual)
  document.getElementById('cellarForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const cellarRecord = {
      id: document.getElementById('cellarWineId').value || undefined,
      createdAt: state.editingCreatedAt || undefined,
      status: 'cellar',
      name: document.getElementById('cellarWineName').value.trim(),
      type: document.getElementById('cellarWineType').value,
      grapes: document.getElementById('cellarWineGrapes').value.trim(),
      country: document.getElementById('cellarWineCountry').value.trim(),
      vintage: document.getElementById('cellarWineVintage').value.trim(),
      quantity: Math.max(1, Number(document.getElementById('cellarWineQty').value) || 1),
      cellarObs: document.getElementById('cellarWineObs').value.trim(),
      labelPhoto: state.currentCellarLabelPhoto
    };

    await window.wineDB.saveWine(cellarRecord);
    state.wines = await window.wineDB.getAllWines();
    document.getElementById('cellarFormModal').classList.add('hidden');
    switchToView('cellar');
    refreshAllUI();
    showToast(`🏠 "${cellarRecord.name}" guardado na sua Adega Virtual!`);
  });

  // Sensory Sliders
  ['sensoryBody', 'sensoryTannin', 'sensoryAcidity', 'sensorySweetness'].forEach((id) => {
    document.getElementById(id).addEventListener('input', updateSensoryLabelsUI);
  });

  // Star Rating Picker
  document.querySelectorAll('#starPicker .star-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const val = Number(btn.dataset.star);
      document.getElementById('wineRating').value = val;
      updateStarPickerUI(val);
    });
  });
  document.getElementById('wineRating').addEventListener('input', (e) => {
    updateStarPickerUI(e.target.value);
  });

  // Save Tasted Wine Form Submit (Avaliação + Integração com Adega Virtual)
  document.getElementById('wineForm').addEventListener('submit', async (e) => {
    e.preventDefault();

    const rawScore10 = document.getElementById('wineScore10').value;
    const score10 = rawScore10 !== '' ? Math.min(10, Math.max(0, Number(rawScore10))) : null;
    const fromCellarId = document.getElementById('fromCellarWineId').value;

    const wineRecord = {
      id: document.getElementById('wineId').value || undefined,
      createdAt: state.editingCreatedAt || undefined,
      status: 'tasted',
      name: document.getElementById('wineName').value.trim(),
      type: document.getElementById('wineType').value,
      vintage: document.getElementById('wineVintage').value.trim(),
      grapes: document.getElementById('wineGrapes').value.trim(),
      country: document.getElementById('wineCountry').value.trim(),
      sensory: {
        body: Number(document.getElementById('sensoryBody').value),
        tannin: Number(document.getElementById('sensoryTannin').value),
        acidity: Number(document.getElementById('sensoryAcidity').value),
        sweetness: Number(document.getElementById('sensorySweetness').value)
      },
      rating: Number(document.getElementById('wineRating').value),
      score10,
      rebuy: document.getElementById('wineRebuy').checked,
      tastingDate: document.getElementById('tastingDate').value,
      location: document.getElementById('tastingLocation').value.trim(),
      companions: document.getElementById('tastingCompanions').value.trim(),
      pairing: document.getElementById('tastingPairing').value.trim(),
      occasion: document.getElementById('tastingOccasion').value.trim(),
      notes: document.getElementById('wineNotes').value.trim(),
      labelPhoto: state.currentLabelPhoto,
      memoryPhoto: state.currentMemoryPhoto
    };

    // Se veio da Adega Virtual, dá baixa automática na garrafa da Adega!
    if (fromCellarId) {
      const cellarOrigin = state.wines.find((w) => w.id === fromCellarId);
      if (cellarOrigin) {
        const currentQty = Number(cellarOrigin.quantity) || 1;
        if (currentQty > 1) {
          cellarOrigin.quantity = currentQty - 1;
          await window.wineDB.saveWine(cellarOrigin);
        } else {
          await window.wineDB.deleteWine(fromCellarId);
        }
      }
    }

    await window.wineDB.saveWine(wineRecord);
    state.wines = await window.wineDB.getAllWines();
    document.getElementById('wineFormModal').classList.add('hidden');
    switchToView('catalog');
    refreshAllUI();
    showToast(
      fromCellarId
        ? `🍷 "${wineRecord.name}" avaliado e atualizado na sua Adega!`
        : `🍷 "${wineRecord.name}" salvo nas suas avaliações!`
    );
  });

  // Search & Filters (Tasted Catalog)
  const searchInput = document.getElementById('searchInput');
  const clearBtn = document.getElementById('btnClearSearch');
  searchInput.addEventListener('input', (e) => {
    state.searchQuery = e.target.value;
    clearBtn.classList.toggle('hidden', !state.searchQuery);
    renderCatalog();
  });
  clearBtn.addEventListener('click', () => {
    searchInput.value = '';
    state.searchQuery = '';
    clearBtn.classList.add('hidden');
    renderCatalog();
  });

  document.querySelectorAll('#typeFilterPills .pill').forEach((pill) => {
    pill.addEventListener('click', () => {
      document.querySelectorAll('#typeFilterPills .pill').forEach((p) => p.classList.remove('active'));
      pill.classList.add('active');
      state.filterType = pill.dataset.type;
      renderCatalog();
    });
  });

  document.getElementById('filterRating').addEventListener('change', (e) => {
    state.filterRating = Number(e.target.value);
    renderCatalog();
  });

  document.getElementById('filterRebuy').addEventListener('change', (e) => {
    state.filterRebuy = e.target.value;
    renderCatalog();
  });

  document.getElementById('sortOrder').addEventListener('change', (e) => {
    state.sortOrder = e.target.value;
    renderCatalog();
  });

  // Search & Filters (Adega Virtual)
  document.getElementById('cellarSearchInput').addEventListener('input', (e) => {
    state.cellarSearchQuery = e.target.value;
    renderCellarView();
  });

  document.querySelectorAll('#cellarTypePills .pill').forEach((pill) => {
    pill.addEventListener('click', () => {
      document.querySelectorAll('#cellarTypePills .pill').forEach((p) => p.classList.remove('active'));
      pill.classList.add('active');
      state.cellarFilterType = pill.dataset.type;
      renderCellarView();
    });
  });

  // Backup Modal
  const backupModal = document.getElementById('backupModal');
  document.getElementById('btnBackupMenu').addEventListener('click', () => {
    backupModal.classList.remove('hidden');
  });
  document.getElementById('btnCloseBackupModal').addEventListener('click', () => {
    backupModal.classList.add('hidden');
  });

  // Cloud Database Modal
  const cloudModal = document.getElementById('cloudModal');
  const openCloudModal = () => {
    const cfg = window.wineDB.cloud.loadConfig();
    document.getElementById('cloudProvider').value = cfg.provider || 'supabase';
    document.getElementById('cloudCellarId').value = cfg.cellarId || 'minha-adega-principal';
    document.getElementById('cloudUrl').value = cfg.url || '';
    document.getElementById('cloudApiKey').value = cfg.apiKey || '';
    cloudModal.classList.remove('hidden');
  };

  document.getElementById('btnCloudConfig').addEventListener('click', openCloudModal);
  document.getElementById('btnCloseCloudModal').addEventListener('click', () => {
    cloudModal.classList.add('hidden');
  });

  const btnCopySql = document.getElementById('btnCopySupabaseSql');
  if (btnCopySql) {
    btnCopySql.addEventListener('click', async () => {
      const sqlScript = `create table if not exists public.wines (
  id text primary key,
  cellar_id text not null default 'minha-adega-principal',
  name text not null,
  type text,
  grapes text,
  country text,
  vintage text,
  rating numeric(3,1),
  score10 numeric(3,1),
  tasting_date text,
  payload jsonb not null,
  updated_at timestamptz not null default now()
);
create index if not exists idx_wines_cellar_id on public.wines (cellar_id);
alter table public.wines enable row level security;
drop policy if exists "Acesso total aos rótulos da adega" on public.wines;
create policy "Acesso total aos rótulos da adega" on public.wines for all to anon, authenticated using (true) with check (true);`;

      try {
        await navigator.clipboard.writeText(sqlScript);
        showToast('📋 Comando SQL copiado! Cole no SQL Editor do Supabase e clique em Run.');
      } catch (e) {
        prompt('Copie o código SQL abaixo e cole no SQL Editor do Supabase:', sqlScript);
      }
    });
  }

  document.getElementById('cloudProvider').addEventListener('change', (e) => {
    const hint = document.getElementById('cloudUrlHint');
    if (e.target.value === 'supabase') {
      hint.textContent = 'Encontrada em Project Settings → Data API → Project URL';
    } else {
      hint.textContent = 'Ex: https://seu-projeto-default-rtdb.firebaseio.com';
    }
  });

  document.getElementById('cloudConfigForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    window.wineDB.cloud.saveConfig({
      provider: document.getElementById('cloudProvider').value,
      cellarId: document.getElementById('cloudCellarId').value,
      url: document.getElementById('cloudUrl').value,
      apiKey: document.getElementById('cloudApiKey').value
    });

    showToast('Conectando e sincronizando com o Supabase...');
    const pushed = await window.wineDB.cloud.pushAllToCloud(state.wines);
    state.wines = await window.wineDB.getAllWines();
    refreshAllUI();

    if (pushed) {
      cloudModal.classList.add('hidden');
      showToast('⚡ Supabase conectado! Todos os seus vinhos e adega estão salvos na nuvem.');
    } else {
      showToast('⚠️ Verifique se executou o SQL no Supabase e se a URL e a API Key estão corretas.');
    }
  });

  document.getElementById('btnSyncNow').addEventListener('click', async () => {
    if (!window.wineDB.cloud.isConfigured()) {
      showToast('Preencha a URL e a API Key do Supabase primeiro.');
      return;
    }
    await window.wineDB.cloud.pushAllToCloud(state.wines);
    state.wines = await window.wineDB.getAllWines();
    refreshAllUI();
    showToast('🔄 Sincronização com o Supabase concluída!');
  });

  document.getElementById('btnDisconnectCloud').addEventListener('click', () => {
    window.wineDB.cloud.saveConfig({ provider: 'supabase', url: '', apiKey: '', cellarId: 'minha-adega-principal' });
    cloudModal.classList.add('hidden');
    showToast('Nuvem desconectada. Seus vinhos continuam salvos localmente no aparelho.');
  });

  document.getElementById('btnExportJson').addEventListener('click', () => {
    const dataStr = JSON.stringify(
      {
        app: 'VinoMemo',
        exportedAt: new Date().toISOString(),
        wines: state.wines
      },
      null,
      2
    );
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `vinomemo-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('Backup exportado com sucesso!');
  });

  document.getElementById('inputImportJson').addEventListener('change', async (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      const list = Array.isArray(parsed) ? parsed : parsed.wines;
      if (!Array.isArray(list)) throw new Error('Formato inválido');
      const count = await window.wineDB.importMany(list);
      state.wines = await window.wineDB.getAllWines();
      refreshAllUI();
      backupModal.classList.add('hidden');
      showToast(`${count} registro(s) importado(s) com sucesso!`);
    } catch (err) {
      alert('Não foi possível ler o arquivo de backup. Verifique se é um JSON válido do VinoMemo.');
    }
    e.target.value = '';
  });

  ['wineFormModal', 'cellarFormModal', 'wineDetailModal', 'backupModal', 'cloudModal'].forEach((id) => {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener('click', (e) => {
        if (e.target === el) el.classList.add('hidden');
      });
    }
  });
}

/* ==========================================
   THEME & UTILITIES
========================================== */
function initTheme() {
  const saved = localStorage.getItem('vinomemo_theme') || 'light';
  document.documentElement.setAttribute('data-theme', saved);

  document.getElementById('btnThemeToggle').addEventListener('click', () => {
    const current = document.documentElement.getAttribute('data-theme');
    const next = current === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('vinomemo_theme', next);
    showToast(next === 'dark' ? 'Modo Escuro ativado' : 'Modo Claro ativado');
  });
}

function showToast(message) {
  const container = document.getElementById('toastContainer');
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => {
    toast.remove();
  }, 3800);
}

function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
