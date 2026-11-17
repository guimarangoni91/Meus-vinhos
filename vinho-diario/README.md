# 🍷 VinoMemo — Diário de Rótulos, Adega Virtual & Memórias

Aplicação Web Progressiva (**PWA Offline-First**) para gerenciamento de **Adega Virtual doméstica**, registro didático de **vinhos degustados**, perfil de paladar e mural de lembranças fotográficas, com sincronização em nuvem via **Supabase (PostgreSQL)**.

---

## 📁 Estrutura do Projeto (Arquitetura de Manutenção)

```text
vinho-diario/
├── index.html                  # Aplicação principal (SPA modular HTML5)
├── styles.css                  # Design System, temas (Claro/Escuro), layout responsivo e Mobile Bottom Nav
├── db.js                       # Camada de Dados: IndexedDB + LocalStorage Fallback + CloudSyncManager (Supabase/Firebase)
├── app.js                      # Controlador de UI: Catálogo, Adega Virtual, Mini Dashboard, Mural Polaroid e Estatísticas
├── sw.js                       # Service Worker para funcionamento Offline (Cache-First de assets estáticos)
├── manifest.json               # Manifesto Web App (PWA) para instalação no Android e iOS
├── icon-192.png / icon-512.png # Ícones do aplicativo gerados via script
├── vinomemo-mobile.html        # Artefato gerado (Single-File Bundle 100% portátil)
├── package.json                # Scripts de automação, build e validação para desenvolvedores
├── supabase-setup.sql          # Script rápido de bootstrap da tabela no Supabase
├── sql/                        # Migrações e Views Analíticas (Engenharia de Dados)
│   ├── 001_initial_schema.sql  # DDL completo, índices B-Tree/GIN, triggers e políticas RLS
│   └── 002_analytics_views.sql # Views analíticas (vw_cellar_inventory, vw_tasted_analytics, vw_palate_profile_summary)
├── scripts/                    # Ferramentas de Build e Qualidade (Node.js)
│   ├── validate.js             # Validador de sintaxe JS, manifesto PWA e integridade de arquivos
│   ├── build-mobile.js         # Empacotador que gera o arquivo único `vinomemo-mobile.html`
│   └── generate-icons.js       # Gerador determinístico dos ícones PNG (sem dependências externas)
└── docs/                       # Documentação Técnica e de Engenharia de Dados
    ├── ARCHITECTURE.md         # Diagramas de arquitetura, algoritmo de sync LWW e máquina de estados
    └── DATA_DICTIONARY.md      # Dicionário de dados PostgreSQL, contrato JSONB e chaves locais
```

---

## 🚀 Guia Rápido para Desenvolvedores

### Pré-requisitos
- Qualquer navegador moderno (para execução direta)
- **Node.js >= 18** (opcional, apenas para rodar os scripts de validação e empacotamento mobile)

### Comandos Disponíveis (`npm scripts`)

```bash
# 1. Validar sintaxe JavaScript, integridade de arquivos e manifesto PWA
npm run validate

# 2. Regerar os ícones PNG (icon-192.png e icon-512.png)
npm run build:icons

# 3. Gerar o artefato portátil de arquivo único (vinomemo-mobile.html)
npm run build:mobile

# 4. Executar pipeline completo de validação + geração de artefatos
npm run build

# 5. Iniciar servidor web local na porta 8080
npm start
```

---

## 🗄️ Engenharia de Dados & Banco na Nuvem (Supabase)

O banco de dados utiliza uma modelagem **Híbrida (Relacional + Documento JSONB)** no PostgreSQL do Supabase:

1. **Setup Inicial do Banco:**
   Execute a migração [`sql/001_initial_schema.sql`](sql/001_initial_schema.sql) no *SQL Editor* do Supabase para criar a tabela `public.wines`, índices (`B-Tree` em `cellar_id` e `GIN` em `payload`) e políticas de *Row Level Security (RLS)*.
2. **Camada Analítica (BI / Data Mart):**
   Execute [`sql/002_analytics_views.sql`](sql/002_analytics_views.sql) para criar as views analíticas prontas para consumo em SQL ou ferramentas de BI:
   - `public.vw_cellar_inventory` — Estoque atual da Adega Virtual em casa.
   - `public.vw_tasted_analytics` — Histórico desnormalizado de degustações, notas (0–10) e dimensões sensoriais.
   - `public.vw_palate_profile_summary` — Agregações de perfil de paladar por estilo e país.

Para detalhes completos sobre o modelo de dados e resolução de conflitos *Last-Write-Wins (LWW)*, consulte:
- 📖 **[Arquitetura de Software e Sincronização (`docs/ARCHITECTURE.md`)](docs/ARCHITECTURE.md)**
- 📊 **[Dicionário de Dados e Contratos (`docs/DATA_DICTIONARY.md`)](docs/DATA_DICTIONARY.md)**

---

## 🛠️ Guia de Manutenção Comum

### Como adicionar um novo campo ao cadastro de vinhos?
1. **HTML (`index.html`):** Adicione o `<input>` no formulário `#wineForm` (para vinhos degustados) ou `#cellarForm` (para a Adega Virtual).
2. **Controller (`app.js`):**
   - Leia o valor no listener de `submit` do respectivo formulário e inclua no objeto passado para `window.wineDB.saveWine(record)`.
   - Exiba o campo nos templates de `renderCatalog()`, `renderCellarView()` ou `openWineDetailModal()`.
3. **Banco de Dados (`db.js` / Supabase):**
   - Como o `CloudSyncManager` persiste o objeto inteiro na coluna `payload` (`jsonb`), **novos campos no objeto JS são salvos automaticamente no Supabase sem exigir `ALTER TABLE`**.
4. **Atualizar Versão Mobile:**
   - Após editar `index.html`, `styles.css`, `db.js` ou `app.js`, execute `npm run build` para validar e atualizar o `vinomemo-mobile.html`.
   - Se alterar arquivos estáticos cacheados offline, incremente a constante `CACHE_NAME` em `sw.js` (ex: `'vinomemo-v3'`).
