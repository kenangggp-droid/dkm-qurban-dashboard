# Dashboard Tabungan Qurban

Frontend ini dibuat dari file `DKM_Qurban_Sederhana_Visual.xlsx`.

## Membuka Website

Buka file:

`index.html`

Jika dibuka lewat server lokal, jalankan dari folder ini:

```bash
python3 -m http.server 4173
```

Lalu buka:

`http://127.0.0.1:4173`

## Deploy ke Cloudflare Pages

1. Push folder ini ke repository GitHub.
2. Buka Cloudflare Dashboard.
3. Pilih `Workers & Pages > Create > Pages > Connect to Git`.
4. Pilih repository GitHub yang berisi project ini.
5. Gunakan pengaturan:

```text
Framework preset: None
Build command: kosong
Build output directory: /
```

6. Klik `Save and Deploy`.

Project ini adalah website statis sehingga tidak memerlukan proses build.

## Sinkron dengan Spreadsheet Online

1. Upload file Excel ke Google Drive.
2. Buka dengan Google Sheets.
3. Pastikan nama sheet data tetap `Data Peserta`.
4. Pastikan header kolom tetap seperti ini:

```text
Nama Peserta, Jan, Feb, Mar, Apr, Mei, Jun, Jul, Agu, Sep, Okt, Nov, Des
```

5. Di Google Sheets, pilih `File > Share > Publish to web`.
6. Pilih sheet `Data Peserta`.
7. Pilih format `Comma-separated values (.csv)`.
8. Klik `Publish`, lalu salin URL CSV-nya.
9. Buka file `config.json`, isi `onlineCsvUrl` dengan URL tersebut.

Untuk Google Sheets, website akan otomatis memakai mode khusus agar data bisa dibaca dari web lokal tanpa masalah CORS.

Contoh:

```json
{
  "onlineCsvUrl": "https://docs.google.com/spreadsheets/d/SPREADSHEET_ID/gviz/tq?tqx=out:csv&sheet=Data%20Peserta"
}
```

Setelah itu, edit nama peserta atau setoran di Google Sheets. Refresh website untuk melihat perubahan terbaru.
