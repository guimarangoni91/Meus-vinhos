# Dicionário de Dados e Contratos de Schema — VinoMemo

Este documento especifica o modelo de dados relacional (PostgreSQL / Supabase), o contrato do documento JSONB (`payload`) e as estruturas de armazenamento local do navegador.

---

## 1. Tabela Relacional no Supabase (`public.wines`)

A tabela `public.wines` utiliza uma modelagem **Híbrida (Colunar + Documento JSONB)**:
- As colunas relacionais expõem os atributos mais consultados para leitura direta no *Supabase Table Editor* e consultas SQL rápidas.
- A coluna `payload` (`jsonb`) armazena o objeto completo da aplicação, permitindo evoluir o schema do frontend (como os campos da Adega Virtual e fotos comprimidas) sem quebrar migrações existentes.

| Coluna | Tipo PostgreSQL | Nulo? | Descrição | Exemplo |
| :--- | :--- | :---: | :--- | :--- |
| `id` | `text` (PK) | Não | Chave composta única no formato `{cellar_id}__{wine_id}` | `minha-adega-principal__wine_17318_a9f` |
| `cellar_id` | `text` | Não | Identificador lógico da adega do usuário (partição de sincronização) | `minha-adega-principal` |
| `name` | `text` | Não | Nome comercial do vinho / rótulo | `Catena Malbec` |
| `type` | `text` | Sim | Estilo do vinho (`Tinto`, `Branco`, `Rosé`, `Espumante`, `Sobremesa/Fortificado`) | `Tinto` |
| `grapes` | `text` | Sim | Tipo(s) de uva / castas separados por vírgula | `Malbec` |
| `country` | `text` | Sim | País de origem do rótulo | `Argentina` |
| `vintage` | `text` | Sim | Ano da safra (ou `NV` para *Non-Vintage*) | `2021` |
| `rating` | `numeric(3,1)` | Sim | Avaliação em estrelas de `1.0` a `5.0` (incrementos de `0.5`) | `4.5` |
| `score10` | `numeric(3,1)` | Sim | Nota pessoal de `0.0` a `10.0` | `9.5` |
| `tasting_date` | `text` | Sim | Data da degustação no formato ISO (`YYYY-MM-DD`) | `2026-10-24` |
| `payload` | `jsonb` | Não | Objeto JSON completo do registro (ver Seção 2 abaixo) | `{ "id": "...", "status": "tasted", ... }` |
| `updated_at` | `timestamptz` | Não | Data/hora UTC da última atualização | `2026-11-17T19:00:00Z` |

---

## 2. Contrato do Objeto `WineRecord` (JSONB `payload` & `IndexedDB`)

Cada registro salvo no `IndexedDB` (store `wines`) e enviado no campo `payload` do Supabase segue o contrato abaixo:

```json
{
  "id": "wine_1731864000000_x8k2p",
  "status": "tasted",
  "name": "Catena Malbec",
  "type": "Tinto",
  "grapes": "Malbec",
  "country": "Argentina",
  "vintage": "2021",
  "quantity": 1,
  "cellarObs": "Guardado para jantar especial",
  "rating": 5.0,
  "score10": 9.5,
  "rebuy": true,
  "sensory": {
    "body": 4,
    "tannin": 3,
    "acidity": 3,
    "sweetness": 1
  },
  "tastingDate": "2026-10-24",
  "location": "Jantar em Casa",
  "companions": "Amor",
  "occasion": "Comemoração de aniversário",
  "pairing": "Carne assada e risoto de queijo",
  "notes": "Vinho super macio, encorpado na medida certa e não amarra a boca!",
  "labelPhoto": "data:image/jpeg;base64,...",
  "memoryPhoto": "data:image/jpeg;base64,...",
  "createdAt": "2026-10-24T22:15:00.000Z",
  "updatedAt": "2026-10-24T22:15:00.000Z"
}
```

### Detalhamento dos Atributos Específicos do `payload`
- `status` (`'tasted' | 'cellar'`):
  - `'cellar'`: Garrafa guardada em casa na **Adega Virtual** (ainda não degustada).
  - `'tasted'` (ou omitido por retrocompatibilidade): Vinho já degustado e avaliado.
- `quantity` (`number`): Quantidade de garrafas em estoque na Adega Virtual (aplicável quando `status === 'cellar'`).
- `cellarObs` (`string`): Observação rápida da garrafa na Adega Virtual.
- `sensory` (`object`): Escalas didáticas de percepção na boca (valores inteiros de `1` a `5`):
  - `body`: Peso na boca (`1` = Bem Leve → `5` = Bem Encorpado)
  - `tannin`: Sensação de amarrar (`1` = Não amarra → `5` = Amarra bastante)
  - `acidity`: Refrescância (`1` = Suave → `5` = Muito Refrescante)
  - `sweetness`: Doçura (`1` = Seco → `5` = Bem Doce)
- `labelPhoto` (`string`): DataURL (`image/jpeg` comprimido ou `image/svg+xml` gerado) da foto do rótulo.
- `memoryPhoto` (`string`): DataURL (`image/jpeg` comprimido) da foto de lembrança do momento.

---

## 3. Chaves de Armazenamento no Navegador (Client Storage)

| Tecnologia | Nome / Chave | Finalidade |
| :--- | :--- | :--- |
| **IndexedDB** | Banco `VinoMemoDB` (v1) → Store `wines` | Armazenamento primário local de alta capacidade (keyPath: `id`). |
| **LocalStorage** | `vinomemo_wines_storage_v1` | Fallback automático de persistência caso o `IndexedDB` esteja bloqueado. |
| **LocalStorage** | `vinomemo_cloud_config_v1` | Credenciais e preferências de conexão com a nuvem (`provider`, `url`, `apiKey`, `cellarId`). |
| **LocalStorage** | `vinomemo_theme` | Preferência visual do usuário (`'light'` ou `'dark'`). |
| **LocalStorage** | `vinomemo_initial_seeded` / `vinomemo_cellar_seeded` | Flags booleanas que evitam recriar registros de exemplo após o primeiro uso. |
| **Cache Storage** | `vinomemo-v2` (Service Worker `sw.js`) | Cache de arquivos estáticos (`HTML`, `CSS`, `JS`, `PNG`) para funcionamento offline. |
