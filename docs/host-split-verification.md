# Host-split verification (post-DNS)

Run after `admin.filmyynatta.com` DNS resolves to `185.158.133.1`
and Lovable shows the domain as **Active**.

## Manual browser checks (incognito)

1. `https://www.filmyynatta.com/admin/products` → เด้งเป็น `https://admin.filmyynatta.com/admin/products`
2. `https://admin.filmyynatta.com/shop` → เด้งเป็น `https://www.filmyynatta.com/shop`
3. `https://www.filmyynatta.com/` → scroll ล่าง เห็นลิงก์ "เจ้าหน้าที่ / Staff login" → คลิก → เปิด `https://admin.filmyynatta.com/auth`
4. `https://admin.filmyynatta.com/` (ไม่ล็อกอิน) → เด้งเข้า `/auth`
5. View-source `https://admin.filmyynatta.com/` → มี `<meta id="__admin-host-noindex" name="robots" content="noindex,nofollow">`
6. View-source `https://www.filmyynatta.com/` → **ไม่มี** meta noindex ตัวนั้น
7. LINE LIFF (`/l/shop`, `/l/link`) เปิดได้เฉพาะบน `www.filmyynatta.com` (ต้องไม่เด้งไป admin)

## Automated

```
bunx vitest run src/lib/__tests__/hostMode.test.ts \
  src/__tests__/host-route-gate.test.tsx \
  src/pages/__tests__/AdminLoginRedirect.test.tsx
bunx playwright test tests/e2e/host-split.spec.ts
bash scripts/security-check.sh
```

## Rollback

ถ้า `admin.filmyynatta.com` ล่ม ให้เพิ่มโดเมนสำรอง (เช่น
`yynatta-admin.com`) กลับเข้า `ADMIN_HOSTS` และตั้งเป็น
`ADMIN_HOST_PRIMARY` ใน `src/lib/hostMode.ts` ชั่วคราว.