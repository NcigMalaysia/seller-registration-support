# Seller Registration Support

Sistem ringkas untuk seller melaporkan isu pendaftaran customer dan admin menyelesaikannya. UI dalam Bahasa Melayu. GitHub Pages menghoskan website; Supabase mengurus login dan database.

## Fungsi V1

- Seller baharu mendaftar menggunakan **nama, email sendiri dan password**, mengesahkan email, kemudian menunggu kelulusan admin. Akaun lama masih boleh login menggunakan username; akaun baharu login menggunakan email.
- Admin melihat senarai pendaftaran dan menekan **Luluskan**. Seller yang belum diluluskan tidak boleh menghantar kes.
- Seller yang diluluskan menghantar nama customer, telefon customer, telefon seller, unique code dan komen/isu.
- Case ID dan masa dijana automatik. Seller melihat kes milik akaun sendiri serta remark admin.
- Admin melihat semua kes, menukar status `Open → In Progress → Solved` dan menulis remark.
- Pendaftaran terbuka dengan pengesahan email, diikuti kelulusan admin. Jangan kongsi satu akaun antara seller.
- Data diasingkan oleh Row Level Security (RLS) dalam database, bukan hanya penapis pada browser.

## Setup Supabase

1. Cipta projek Supabase. Di **SQL Editor**, jalankan `supabase/schema.sql` **sekali** pada projek baharu. Untuk projek yang sudah menggunakan skema lama, jalankan `supabase/registration_migration.sql` **sekali**.
2. Pastikan **Authentication → Sign In / Providers → Email** membenarkan pendaftaran dan pengesahan email. Di **Authentication → URL Configuration**, tetapkan Site URL kepada URL website dan tambah URL tersebut sebagai redirect yang dibenarkan. **Custom SMTP diperlukan sebelum berkongsi link dengan seller luar organisasi Supabase**; penghantaran email lalai hanya untuk ahli organisasi dan terhad. Seller perlu menggunakan email sebenar supaya boleh mengesahkan akaun.
3. Di **Project Settings → API**, salin Project URL dan **publishable key**. Jangan sekali-kali gunakan secret/service-role key dalam `VITE_...`, HTML, atau GitHub Pages.
4. Pada komputer admin, sediakan `SUPABASE_URL` dan `SUPABASE_SECRET_KEY` sebagai environment variables. Secret key hanya untuk skrip tempatan. Skrip ini pilihan untuk akaun admin atau akaun manual:

   ```bash
   npm install
   node scripts/manage-user.mjs create admin01 "Admin Support" admin
   node scripts/manage-user.mjs create seller01 "Nama Seller" seller
   ```

   Skrip menjana password rawak dan memaparkannya sekali. Kongsi secara peribadi; jangan simpan dalam repo. Untuk reset password: `node scripts/manage-user.mjs reset seller01`.

   **Nota:** login username dipetakan kepada alamat dalaman `${username}@seller.example.com` untuk Supabase Auth. Tiada self-service password recovery melalui email bagi akaun ini; admin reset dengan skrip. Jika mahu reset sendiri, perlu tambah aliran email sah pada versi seterusnya.

5. Jalankan lokal: salin `.env.example` ke `.env`, isi URL dan publishable key, kemudian `npm run dev`.

## Deploy GitHub Pages

GitHub Free hanya menyokong Pages daripada repository public. Jika repo dikekalkan private, GitHub Pages memerlukan pelan yang menyokong private repository atau hosting lain. Jangan terbitkan kod sebelum menyemak pilihan visibility.

1. Push kandungan folder projek ini ke **root** repo GitHub baharu dan pastikan branch `main`.
2. Dalam repo **Settings → Secrets and variables → Actions → Variables**, tambah `VITE_SUPABASE_URL` dan `VITE_SUPABASE_PUBLISHABLE_KEY`. Kedua-duanya konfigurasi public client, bukan secret key.
3. Dalam **Settings → Pages → Build and deployment**, pilih **GitHub Actions**. Workflow `.github/workflows/deploy.yml` membina dan menerbitkan setiap push ke `main`.
4. Uji dengan akaun seller dan admin sebenar. Seller mesti hanya boleh lihat kes sendiri; admin boleh buka, kemas kini remark dan Solve.

Untuk projek yang menyahaktifkan pendedahan jadual automatik dalam **Data API → Settings**, pastikan `public.profiles` dan `public.cases` didedahkan secara manual; fungsi tidak perlu didedahkan.

## Keselamatan dan batasan

- Nama dan telefon customer ialah data peribadi. Berikan akses hanya kepada seller/admin yang perlu; tetapkan polisi penyimpanan/pemadaman mengikut operasi anda. V1 belum ada padam rekod, lampiran, notifikasi, atau sejarah perubahan remark.
- Senarai dimuatkan 100 kes setiap kali; carian dan ringkasan hanya meliputi kes yang telah dimuatkan (simbol `+` menunjukkan masih ada kes lain).
- Refresh manual untuk melihat kemas kini terkini. Sistem belum menghantar pemberitahuan automatik.
- `SUPABASE_SECRET_KEY` memberi kuasa pentadbir penuh: simpan hanya di komputer admin/secret manager, jangan letak dalam GitHub Actions untuk deployment.
