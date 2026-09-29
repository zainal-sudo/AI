# Marsys2 AI API

Backend AI agent (Node.js + Express) untuk aplikasi **Marsys2** (PT. AMP).
API ini membaca langsung database MySQL `marsys2` dan menyediakan **chat AI Bahasa Indonesia**
yang menjawab pertanyaan soal **Laporan Penjualan** dan **Stok/Persediaan**.

Aplikasi sumber: `D:\marsys2\Marsys2` (VB.NET WinForms, database MySQL `143.198.220.117:3321/marsys2`).

## Fitur

- `POST /api/auth/login` — login JWT. Menerima user **desktop** (`tuser`, password dienkripsi gaya Marsys/AES) dan user **mobile** (`tusermobile`, password plaintext).
- `POST /api/ai/chat` — LLM (OpenAI-compatible, function calling) dengan **tools** yang membaca data nyata dari MySQL:
  - **Penjualan**: `rekap_penjualan` (total/bulan/customer/marketing), `detail_penjualan` (per item), `rekap_penjualan_hpp_margin` (HPP & margin).
  - **Stok**: `kartu_stok` (mutasi + saldo berjalan, via SP `pkartuStok`), `history_stok` (via SP `pGetHistoryStok`), `saldo_stok` (stok saat ini, bisa disaring `kritisDiBawah`), `daftar_gudang`, `daftar_bahan`.
  - **Lainnya**: `daftar_customer`, `daftar_marketing`, `daftar_barang`.
- `POST /api/ai/feedback` — simpan feedback 👍/👎 (opsional, jika `CHATLOG_TABLE=on` maka tabel `ai_chatlog` dibuat di DB yang sama).
- `GET /health` — status server.

Kontrak respons mengikuti format frontend "AI Asistent": `{ success, data: { answer, sources, model, toolCount, chatLogId, usage } }`.

## Setup

```bash
cd marsys2-api
npm install
copy .env.example .env   # lalu isi OPENAI_API_KEY dsb.
npm start                 # tersedia pada port 4000 (atur di .env PORT)
```

### `.env`

| Variable | Keterangan |
|---|---|
| `PORT` | Port API (default `4000`) |
| `DB_HOST` / `DB_PORT` / `DB_USER` / `DB_PASSWORD` / `DB_NAME` | Koneksi MySQL Marsys2 |
| `JWT_SECRET` / `JWT_EXPIRES` | Secret & masa berlaku token (default `12h`) |
| `OPENAI_BASE_URL` | Base URL LLM (contoh: `https://api.openai.com/v1`, OpenRouter, vLLM, Ollama `http://localhost:11434/v1`) |
| `OPENAI_API_KEY` | API key LLM |
| `OPENAI_MODEL` | Model (contoh `gpt-4o-mini`) |
| `OPENAI_TIMEOUT` | Timeout LLM (ms) |
| `AGENT_MAX_ITERATIONS` | Maks iterasi tool-call per pertanyaan |
| `CHATLOG_TABLE` | `on`/`off` — simpan chat & feedback ke tabel `ai_chatlog` |

> Catatan keamanan: API hanya **membaca** data (read-only). LLM **tidak pernah** menulis ke database.

## Deploy / Produksi

```bash
npm i -g pm2
pm2 start ecosystem.config.cjs
pm2 save
```

## Integrasi dengan frontend "AI Asistent"

Frontend Vue memakai `baseURL` di `src/api/axios.ts` dan proxy di `vite.config.ts`.
Untuk memakai backend ini, arahkan ke:

- Dev: ubah proxy target `vite.config.ts` → `http://localhost:4000`
- Prod: ubah `src/api/axios.ts` → `http://<IP_SERVER>:4000/api`

Flow login frontend (pilih cabang → login) tetap jalan karena endpoint `/api/auth/cabang` dan `/api/auth/users` sudah disediakan (satu cabang: "PT. AMP").

## Endpoint ringkas

```
GET  /health
GET  /api/auth/cabang
GET  /api/auth/users?dbase=
POST /api/auth/login            { username, password }
POST /api/ai/chat               { messages: [{role, content}] }      (JWT)
POST /api/ai/feedback           { chatLogId, thumb: 1|-1 }           (JWT)
```