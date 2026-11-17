/**
 * VinoMemo — Camada de Persistência Híbrida: Nuvem (Firebase / Supabase) + Local (IndexedDB / LocalStorage)
 */

const DB_NAME = 'VinoMemoDB';
const DB_VERSION = 1;
const STORE_NAME = 'wines';
const CLOUD_CONFIG_KEY = 'vinomemo_cloud_config_v1';

const DEFAULT_SUPABASE_URL = 'https://jsaspzuoqmwxbsjisiuy.supabase.co';
const DEFAULT_SUPABASE_KEY = 'sb_publishable_2_aQVNgyD2b7D2bBwFqgJg_RgKhiDq1';

class CloudSyncManager {
  constructor() {
    this.config = this.loadConfig();
    this.onStatusChange = null;
    this.status = this.isConfigured() ? 'connected' : 'unconfigured';
  }

  loadConfig() {
    try {
      const raw = localStorage.getItem(CLOUD_CONFIG_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (!parsed.url) parsed.url = DEFAULT_SUPABASE_URL;
        if (!parsed.apiKey) parsed.apiKey = DEFAULT_SUPABASE_KEY;
        parsed.url = parsed.url.replace(/\/rest\/v1\/?$/i, '').replace(/\/+$/, '');
        return parsed;
      }
      return {
        provider: 'supabase',
        url: DEFAULT_SUPABASE_URL,
        apiKey: DEFAULT_SUPABASE_KEY,
        cellarId: 'minha-adega-principal'
      };
    } catch (e) {
      return {
        provider: 'supabase',
        url: DEFAULT_SUPABASE_URL,
        apiKey: DEFAULT_SUPABASE_KEY,
        cellarId: 'minha-adega-principal'
      };
    }
  }

  saveConfig(newConfig) {
    this.config = {
      provider: (newConfig.provider || 'supabase').trim(),
      url: (newConfig.url || DEFAULT_SUPABASE_URL)
        .trim()
        .replace(/\/rest\/v1\/?$/i, '')
        .replace(/\/+$/, ''),
      apiKey: (newConfig.apiKey || DEFAULT_SUPABASE_KEY).trim(),
      cellarId: (newConfig.cellarId || 'minha-adega-principal')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9_-]/g, '-')
    };
    localStorage.setItem(CLOUD_CONFIG_KEY, JSON.stringify(this.config));
    this.setStatus(this.isConfigured() ? 'connected' : 'unconfigured');
  }

  _getSupabaseHeaders(extra = {}) {
    const headers = {
      apikey: this.config.apiKey,
      ...extra
    };
    if (this.config.apiKey && this.config.apiKey.startsWith('eyJ')) {
      headers.Authorization = `Bearer ${this.config.apiKey}`;
    }
    return headers;
  }

  isConfigured() {
    if (!this.config || !this.config.url) return false;
    if (this.config.provider === 'supabase' && !this.config.apiKey) return false;
    return true;
  }

  setStatus(status, message = '') {
    this.status = status;
    if (typeof this.onStatusChange === 'function') {
      this.onStatusChange(status, message);
    }
  }

  /**
   * Busca todos os vinhos na nuvem
   */
  async fetchAllFromCloud() {
    if (!this.isConfigured()) return null;
    this.setStatus('syncing', 'Sincronizando com a nuvem...');

    try {
      if (this.config.provider === 'firebase') {
        const endpoint = `${this.config.url}/cellars/${encodeURIComponent(this.config.cellarId)}/wines.json${
          this.config.apiKey ? `?auth=${encodeURIComponent(this.config.apiKey)}` : ''
        }`;
        const res = await fetch(endpoint, { method: 'GET' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        this.setStatus('connected', 'Sincronizado na nuvem');
        if (!data) return [];
        return Object.values(data).filter((item) => item && item.id && !item._deleted);
      }

      if (this.config.provider === 'supabase') {
        const endpoint = `${this.config.url}/rest/v1/wines?cellar_id=eq.${encodeURIComponent(
          this.config.cellarId
        )}&select=id,payload,updated_at`;
        const res = await fetch(endpoint, {
          method: 'GET',
          headers: this._getSupabaseHeaders()
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const rows = await res.json();
        this.setStatus('connected', 'Sincronizado na nuvem');
        return (rows || []).map((r) => r.payload).filter(Boolean);
      }
    } catch (err) {
      console.error('Erro ao buscar da nuvem:', err);
      this.setStatus('error', 'Falta criar a tabela wines no SQL Editor do Supabase ou sem conexão');
      return null;
    }
    return null;
  }

  /**
   * Salva ou atualiza 1 vinho na nuvem
   */
  async pushWineToCloud(wine) {
    if (!this.isConfigured()) return false;
    this.setStatus('syncing', 'Salvando na nuvem...');

    try {
      if (this.config.provider === 'firebase') {
        const endpoint = `${this.config.url}/cellars/${encodeURIComponent(
          this.config.cellarId
        )}/wines/${encodeURIComponent(wine.id)}.json${
          this.config.apiKey ? `?auth=${encodeURIComponent(this.config.apiKey)}` : ''
        }`;
        const res = await fetch(endpoint, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(wine)
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        this.setStatus('connected', 'Salvo na nuvem');
        return true;
      }

      if (this.config.provider === 'supabase') {
        const endpoint = `${this.config.url}/rest/v1/wines?on_conflict=id`;
        const fullRow = {
          id: `${this.config.cellarId}__${wine.id}`,
          cellar_id: this.config.cellarId,
          name: wine.name || 'Vinho',
          type: wine.type || null,
          grapes: wine.grapes || null,
          country: wine.country || null,
          vintage: wine.vintage || null,
          rating: wine.rating !== undefined ? Number(wine.rating) : null,
          score10: wine.score10 !== undefined && wine.score10 !== null ? Number(wine.score10) : null,
          tasting_date: wine.tastingDate || null,
          payload: wine,
          updated_at: wine.updatedAt || new Date().toISOString()
        };
        let res = await fetch(endpoint, {
          method: 'POST',
          headers: this._getSupabaseHeaders({
            'Content-Type': 'application/json',
            Prefer: 'resolution=merge-duplicates'
          }),
          body: JSON.stringify(fullRow)
        });
        if (!res.ok) {
          // Fallback caso a tabela tenha apenas as colunas mínimas
          res = await fetch(endpoint, {
            method: 'POST',
            headers: this._getSupabaseHeaders({
              'Content-Type': 'application/json',
              Prefer: 'resolution=merge-duplicates'
            }),
            body: JSON.stringify({
              id: `${this.config.cellarId}__${wine.id}`,
              cellar_id: this.config.cellarId,
              payload: wine,
              updated_at: wine.updatedAt || new Date().toISOString()
            })
          });
        }
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        this.setStatus('connected', 'Salvo no Supabase');
        return true;
      }
    } catch (err) {
      console.error('Erro ao salvar na nuvem:', err);
      this.setStatus('error', 'Salvo no aparelho (pendente envio p/ nuvem)');
      return false;
    }
    return false;
  }

  /**
   * Remove 1 vinho da nuvem
   */
  async deleteWineFromCloud(wineId) {
    if (!this.isConfigured()) return false;
    this.setStatus('syncing', 'Removendo da nuvem...');

    try {
      if (this.config.provider === 'firebase') {
        const endpoint = `${this.config.url}/cellars/${encodeURIComponent(
          this.config.cellarId
        )}/wines/${encodeURIComponent(wineId)}.json${
          this.config.apiKey ? `?auth=${encodeURIComponent(this.config.apiKey)}` : ''
        }`;
        const res = await fetch(endpoint, { method: 'DELETE' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        this.setStatus('connected', 'Sincronizado na nuvem');
        return true;
      }

      if (this.config.provider === 'supabase') {
        const compositeId = `${this.config.cellarId}__${wineId}`;
        const endpoint = `${this.config.url}/rest/v1/wines?id=eq.${encodeURIComponent(compositeId)}`;
        const res = await fetch(endpoint, {
          method: 'DELETE',
          headers: this._getSupabaseHeaders()
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        this.setStatus('connected', 'Sincronizado na nuvem');
        return true;
      }
    } catch (err) {
      console.error('Erro ao excluir da nuvem:', err);
      this.setStatus('error', 'Erro ao sincronizar exclusão');
      return false;
    }
    return false;
  }

  /**
   * Envia todos os vinhos locais para a nuvem
   */
  async pushAllToCloud(winesArray) {
    if (!this.isConfigured()) return false;
    this.setStatus('syncing', 'Enviando todos os rótulos para a nuvem...');

    try {
      if (this.config.provider === 'firebase') {
        const mapObj = {};
        winesArray.forEach((w) => {
          if (w && w.id) mapObj[w.id] = w;
        });
        const endpoint = `${this.config.url}/cellars/${encodeURIComponent(this.config.cellarId)}/wines.json${
          this.config.apiKey ? `?auth=${encodeURIComponent(this.config.apiKey)}` : ''
        }`;
        const res = await fetch(endpoint, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(mapObj)
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        this.setStatus('connected', 'Todos os vinhos salvos na nuvem');
        return true;
      }

      if (this.config.provider === 'supabase') {
        for (const w of winesArray) {
          await this.pushWineToCloud(w);
        }
        this.setStatus('connected', 'Todos os vinhos salvos na nuvem');
        return true;
      }
    } catch (err) {
      console.error('Erro ao enviar lote para a nuvem:', err);
      this.setStatus('error', 'Falha ao conectar com a nuvem');
      return false;
    }
    return false;
  }
}

class WineDatabase {
  constructor() {
    this.db = null;
    this.useFallback = false;
    this.fallbackKey = 'vinomemo_wines_storage_v1';
    this.cloud = new CloudSyncManager();
  }

  async init() {
    if (this.db || this.useFallback) return;

    if (typeof indexedDB === 'undefined') {
      this.useFallback = true;
      return;
    }

    return new Promise((resolve) => {
      try {
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onupgradeneeded = (event) => {
          const db = event.target.result;
          if (!db.objectStoreNames.contains(STORE_NAME)) {
            const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
            store.createIndex('tastingDate', 'tastingDate', { unique: false });
            store.createIndex('type', 'type', { unique: false });
            store.createIndex('rating', 'rating', { unique: false });
          }
        };

        request.onsuccess = (event) => {
          this.db = event.target.result;
          resolve(this.db);
        };

        request.onerror = () => {
          this.useFallback = true;
          resolve(null);
        };
      } catch (e) {
        this.useFallback = true;
        resolve(null);
      }
    });
  }

  _getFallbackList() {
    try {
      const raw = localStorage.getItem(this.fallbackKey);
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      return [];
    }
  }

  _saveFallbackList(list) {
    try {
      localStorage.setItem(this.fallbackKey, JSON.stringify(list));
    } catch (e) {
      console.error('Erro ao salvar no armazenamento local:', e);
    }
  }

  async getAllLocalWines() {
    await this.init();
    if (this.useFallback) {
      return this._getFallbackList();
    }
    return new Promise((resolve) => {
      try {
        const tx = this.db.transaction(STORE_NAME, 'readonly');
        const store = tx.objectStore(STORE_NAME);
        const req = store.getAll();
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => resolve(this._getFallbackList());
      } catch (e) {
        this.useFallback = true;
        resolve(this._getFallbackList());
      }
    });
  }

  async getAllWines() {
    const localWines = await this.getAllLocalWines();
    if (!this.cloud.isConfigured()) {
      return localWines;
    }

    // Se a nuvem estiver configurada, faz merge bidirecional inteligente (Nuvem <-> Local)
    const cloudWines = await this.cloud.fetchAllFromCloud();
    if (!cloudWines) {
      return localWines;
    }

    const mergedMap = new Map();
    localWines.forEach((w) => mergedMap.set(w.id, w));

    const toSaveLocally = [];
    cloudWines.forEach((cw) => {
      const existing = mergedMap.get(cw.id);
      if (!existing || (cw.updatedAt || '') >= (existing.updatedAt || '')) {
        mergedMap.set(cw.id, cw);
        toSaveLocally.push(cw);
      }
    });

    if (toSaveLocally.length > 0) {
      await this.importManyLocalOnly(toSaveLocally);
    }

    // Se havia vinhos locais que ainda não estavam na nuvem, envia-os
    const cloudIds = new Set(cloudWines.map((c) => c.id));
    const localOnlyWines = localWines.filter((lw) => !cloudIds.has(lw.id) && !String(lw.id).startsWith('sample_'));
    if (localOnlyWines.length > 0) {
      await this.cloud.pushAllToCloud(localOnlyWines);
    }

    return Array.from(mergedMap.values());
  }

  async saveWine(wine) {
    await this.init();
    const now = new Date().toISOString();
    const record = {
      ...wine,
      id: wine.id || 'wine_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
      updatedAt: now,
      createdAt: wine.createdAt || now
    };

    if (this.useFallback) {
      const list = this._getFallbackList();
      const idx = list.findIndex((w) => w.id === record.id);
      if (idx >= 0) list[idx] = record;
      else list.push(record);
      this._saveFallbackList(list);
    } else {
      await new Promise((resolve, reject) => {
        const tx = this.db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        const req = store.put(record);
        req.onsuccess = () => resolve(record);
        req.onerror = () => reject(req.error);
      });
    }

    // Sincroniza imediatamente com a Nuvem se configurada
    if (this.cloud.isConfigured()) {
      await this.cloud.pushWineToCloud(record);
    }

    return record;
  }

  async deleteWine(id) {
    await this.init();
    if (this.useFallback) {
      const list = this._getFallbackList().filter((w) => w.id !== id);
      this._saveFallbackList(list);
    } else {
      await new Promise((resolve, reject) => {
        const tx = this.db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        const req = store.delete(id);
        req.onsuccess = () => resolve(true);
        req.onerror = () => reject(req.error);
      });
    }

    if (this.cloud.isConfigured()) {
      await this.cloud.deleteWineFromCloud(id);
    }
    return true;
  }

  async importManyLocalOnly(winesArray) {
    await this.init();
    if (this.useFallback) {
      const list = this._getFallbackList();
      winesArray.forEach((w) => {
        if (w && w.name) {
          const id = w.id || 'wine_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
          const idx = list.findIndex((item) => item.id === id);
          const rec = { ...w, id };
          if (idx >= 0) list[idx] = rec;
          else list.push(rec);
        }
      });
      this._saveFallbackList(list);
      return winesArray.length;
    }

    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      winesArray.forEach((w) => {
        if (w && w.name) {
          store.put({
            ...w,
            id: w.id || 'wine_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7)
          });
        }
      });
      tx.oncomplete = () => resolve(winesArray.length);
      tx.onerror = () => reject(tx.error);
    });
  }

  async importMany(winesArray) {
    const count = await this.importManyLocalOnly(winesArray);
    if (this.cloud.isConfigured()) {
      await this.cloud.pushAllToCloud(winesArray);
    }
    return count;
  }
}

/**
 * Comprime uma imagem de arquivo (File) para DataURL JPEG otimizado (ideal para sincronizar rápido na nuvem)
 */
function compressImageFile(file, maxDimension = 1000, quality = 0.8) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        if (width > maxDimension || height > maxDimension) {
          if (width > height) {
            height = Math.round((height * maxDimension) / width);
            width = maxDimension;
          } else {
            width = Math.round((width * maxDimension) / height);
            height = maxDimension;
          }
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        const dataUrl = canvas.toDataURL('image/jpeg', quality);
        resolve(dataUrl);
      };
      img.onerror = reject;
      img.src = e.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/**
 * Gera uma ilustração elegante de rótulo de vinho em SVG DataURL
 */
function generateWineLabelIllustration({ name, grapes, vintage, type, country }) {
  const paletteByType = {
    'Tinto': { bg1: '#2D0C16', bg2: '#5B1829', labelBg: '#FAF4E8', accent: '#8E243D', gold: '#C59B48' },
    'Branco': { bg1: '#1F2C24', bg2: '#334B3C', labelBg: '#FDFBF4', accent: '#7D6A2E', gold: '#D4AF37' },
    'Rosé': { bg1: '#4A1F28', bg2: '#89404F', labelBg: '#FFF8F8', accent: '#C85D71', gold: '#D6A15C' },
    'Espumante': { bg1: '#1D1B18', bg2: '#3B3529', labelBg: '#FCF8EE', accent: '#997A2C', gold: '#E2BE64' },
    'Sobremesa/Fortificado': { bg1: '#2B160E', bg2: '#5E2E1C', labelBg: '#F9F2E4', accent: '#8F3F1D', gold: '#C8963E' }
  };
  const pal = paletteByType[type] || paletteByType['Tinto'];
  const safeName = (name || 'Vinho Especial').slice(0, 28);
  const safeCountry = (country || type || 'Vinho').slice(0, 26).toUpperCase();
  const safeGrapes = (grapes || type || '').slice(0, 28);
  const safeVintage = vintage || 'Safra Especial';

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 420" width="600" height="420">
    <defs>
      <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="${pal.bg1}"/>
        <stop offset="100%" stop-color="${pal.bg2}"/>
      </linearGradient>
    </defs>
    <rect width="600" height="420" fill="url(#bg)"/>
    <circle cx="510" cy="80" r="140" fill="${pal.gold}" opacity="0.08"/>
    <circle cx="80" cy="360" r="160" fill="${pal.gold}" opacity="0.06"/>
    <rect x="115" y="42" width="370" height="336" rx="10" fill="${pal.labelBg}" stroke="${pal.gold}" stroke-width="3"/>
    <rect x="127" y="54" width="346" height="312" rx="6" fill="none" stroke="${pal.gold}" stroke-width="1" opacity="0.7"/>
    <circle cx="300" cy="105" r="24" fill="none" stroke="${pal.gold}" stroke-width="1.5"/>
    <path d="M291 95h18l-1.5 11c-.5 4-3.5 7-7.5 7s-7-3-7.5-7L291 95z" fill="${pal.accent}"/>
    <line x1="300" y1="113" x2="300" y2="122" stroke="${pal.accent}" stroke-width="2"/>
    <line x1="294" y1="122" x2="306" y2="122" stroke="${pal.accent}" stroke-width="2"/>
    <text x="300" y="158" text-anchor="middle" font-family="Georgia, serif" font-size="11" letter-spacing="3" fill="#6E5A4F" font-weight="bold">${safeCountry}</text>
    <line x1="210" y1="172" x2="390" y2="172" stroke="${pal.gold}" stroke-width="1"/>
    <text x="300" y="214" text-anchor="middle" font-family="Georgia, serif" font-size="25" font-weight="bold" fill="#1F1618">${safeName}</text>
    <text x="300" y="246" text-anchor="middle" font-family="Georgia, serif" font-style="italic" font-size="16" fill="${pal.accent}">${safeGrapes}</text>
    <rect x="245" y="274" width="110" height="30" rx="15" fill="${pal.accent}"/>
    <text x="300" y="294" text-anchor="middle" font-family="Georgia, serif" font-size="14" font-weight="bold" fill="#FFFFFF">${safeVintage}</text>
    <text x="300" y="340" text-anchor="middle" font-family="sans-serif" font-size="10" letter-spacing="2" fill="#8C7A6B">DIÁRIO DE MEMÓRIAS • VINOMEMO</text>
  </svg>`;

  return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
}

/**
 * Gera uma ilustração aconchegante para a Foto de Lembrança nos 3 exemplos iniciais
 */
function generateMemorySceneIllustration({ title, subtitle, mood }) {
  const palettes = {
    sunset: { sky1: '#2C1628', sky2: '#8C3B4A', glow: '#F3B664', fg: '#1A0F14' },
    dinner: { sky1: '#1A1823', sky2: '#3D2A35', glow: '#E8A855', fg: '#120D10' },
    celebration: { sky1: '#192730', sky2: '#38575C', glow: '#F2D078', fg: '#10191E' }
  };
  const p = palettes[mood] || palettes.sunset;

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 420" width="600" height="420">
    <defs>
      <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="${p.sky1}"/>
        <stop offset="100%" stop-color="${p.sky2}"/>
      </linearGradient>
    </defs>
    <rect width="600" height="420" fill="url(#sky)"/>
    <circle cx="130" cy="110" r="42" fill="${p.glow}" opacity="0.22"/>
    <circle cx="460" cy="95" r="55" fill="${p.glow}" opacity="0.18"/>
    <circle cx="310" cy="75" r="28" fill="#FFF" opacity="0.15"/>
    <circle cx="210" cy="150" r="16" fill="${p.glow}" opacity="0.35"/>
    <circle cx="400" cy="160" r="20" fill="${p.glow}" opacity="0.3"/>
    <rect x="0" y="320" width="600" height="100" fill="${p.fg}"/>
    <g transform="translate(235, 165) rotate(8)">
      <path d="M10 0 H46 L42 36 C40 50 34 58 28 58 C22 58 16 50 14 36 Z" fill="none" stroke="#FFF" stroke-width="2.5"/>
      <path d="M13 24 H43 L42 36 C40 49 34 56 28 56 C22 56 16 49 14 36 Z" fill="#8B1E34" opacity="0.88"/>
      <line x1="28" y1="58" x2="28" y2="105" stroke="#FFF" stroke-width="2.5"/>
      <line x1="14" y1="105" x2="42" y2="105" stroke="#FFF" stroke-width="2.5"/>
    </g>
    <g transform="translate(305, 172) rotate(-9)">
      <path d="M10 0 H46 L42 36 C40 50 34 58 28 58 C22 58 16 50 14 36 Z" fill="none" stroke="#FFF" stroke-width="2.5"/>
      <path d="M13 24 H43 L42 36 C40 49 34 56 28 56 C22 56 16 49 14 36 Z" fill="#8B1E34" opacity="0.88"/>
      <line x1="28" y1="58" x2="28" y2="105" stroke="#FFF" stroke-width="2.5"/>
      <line x1="14" y1="105" x2="42" y2="105" stroke="#FFF" stroke-width="2.5"/>
    </g>
    <circle cx="298" cy="168" r="5" fill="${p.glow}"/>
    <text x="300" y="362" text-anchor="middle" font-family="Georgia, serif" font-size="22" font-weight="bold" fill="#FAF4E8">${title}</text>
    <text x="300" y="390" text-anchor="middle" font-family="sans-serif" font-size="13" fill="${p.glow}">${subtitle}</text>
  </svg>`;

  return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
}

function getSampleWines() {
  return [
    {
      id: 'sample_1',
      name: 'Catena Malbec',
      type: 'Tinto',
      vintage: '2021',
      grapes: 'Malbec',
      country: 'Argentina',
      rating: 5.0,
      score10: 9.5,
      rebuy: true,
      sensory: { body: 4, tannin: 3, acidity: 3, sweetness: 1 },
      tastingDate: '2026-10-24',
      location: 'Jantar em Casa',
      companions: 'Amor',
      occasion: 'Comemoração de aniversário',
      pairing: 'Carne assada e risoto de queijo',
      notes: 'Vinho super macio, encorpado na medida certa e não amarra a boca! Acompanhou muito bem o jantar e a noite foi inesquecível à luz de velas.',
      labelPhoto: generateWineLabelIllustration({
        name: 'Catena Malbec',
        grapes: 'Malbec',
        vintage: '2021',
        type: 'Tinto',
        country: 'Argentina'
      }),
      memoryPhoto: generateMemorySceneIllustration({
        title: 'Noite de Comemoração à Luz de Velas',
        subtitle: 'Jantar especial em casa • 24/10/2026',
        mood: 'dinner'
      })
    },
    {
      id: 'sample_2',
      name: 'Casillero del Diablo Reserva',
      type: 'Branco',
      vintage: '2023',
      grapes: 'Sauvignon Blanc',
      country: 'Chile',
      rating: 4.5,
      score10: 8.5,
      rebuy: true,
      sensory: { body: 2, tannin: 1, acidity: 4, sweetness: 1 },
      tastingDate: '2026-11-02',
      location: 'Varanda no fim de tarde',
      companions: 'Melhores amigos',
      occasion: 'Tarde ensolarada de sábado',
      pairing: 'Peixe grelhado e petiscos',
      notes: 'Bem levinho e super refrescante para tomar gelado num dia quente! Todo mundo gostou, desce fácil e deixou a conversa da tarde ainda melhor.',
      labelPhoto: generateWineLabelIllustration({
        name: 'Casillero del Diablo',
        grapes: 'Sauvignon Blanc',
        vintage: '2023',
        type: 'Branco',
        country: 'Chile'
      }),
      memoryPhoto: generateMemorySceneIllustration({
        title: 'Pôr do Sol na Varanda com Amigos',
        subtitle: 'Almoço de sábado que virou jantar • 02/11/2026',
        mood: 'sunset'
      })
    },
    {
      id: 'sample_3',
      name: 'Cave Geisse Brut Rosé',
      type: 'Espumante',
      vintage: '2022',
      grapes: 'Pinot Noir',
      country: 'Brasil',
      rating: 4.5,
      score10: 9.0,
      rebuy: true,
      sensory: { body: 3, tannin: 1, acidity: 4, sweetness: 1 },
      tastingDate: '2026-11-10',
      location: 'Piquenique no Mirante',
      companions: 'Família reunida',
      occasion: 'Brinde às conquistas do ano',
      pairing: 'Tábua de queijos e morangos',
      notes: 'Borbulhas bem fininhas e muito agradável de beber! Ótimo espumante brasileiro para brindar em família.',
      labelPhoto: generateWineLabelIllustration({
        name: 'Cave Geisse Rosé',
        grapes: 'Pinot Noir',
        vintage: '2022',
        type: 'Espumante',
        country: 'Brasil'
      }),
      memoryPhoto: generateMemorySceneIllustration({
        title: 'Brinde em Família no Mirante',
        subtitle: 'Tarde especial de celebração • 10/11/2026',
        mood: 'celebration'
      })
    },
    {
      id: 'sample_cellar_1',
      status: 'cellar',
      quantity: 2,
      name: 'Marqués de Casa Concha',
      type: 'Tinto',
      vintage: '2021',
      grapes: 'Carménère',
      country: 'Chile',
      cellarObs: 'Guardado para um jantar de massas ou carnes',
      labelPhoto: generateWineLabelIllustration({
        name: 'Marqués de Casa Concha',
        grapes: 'Carménère',
        vintage: '2021',
        type: 'Tinto',
        country: 'Chile'
      })
    },
    {
      id: 'sample_cellar_2',
      status: 'cellar',
      quantity: 1,
      name: 'Cartuxa EA Reserva',
      type: 'Tinto',
      vintage: '2022',
      grapes: 'Blend / Corte (Várias uvas)',
      country: 'Portugal',
      cellarObs: 'Presente especial — abrir no fim de semana',
      labelPhoto: generateWineLabelIllustration({
        name: 'Cartuxa EA Reserva',
        grapes: 'Blend Alentejano',
        vintage: '2022',
        type: 'Tinto',
        country: 'Portugal'
      })
    }
  ];
}

window.wineDB = new WineDatabase();
window.compressImageFile = compressImageFile;
window.generateWineLabelIllustration = generateWineLabelIllustration;
window.getSampleWines = getSampleWines;
