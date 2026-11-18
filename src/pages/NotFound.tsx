import { Link, useLocation } from "react-router-dom";
import { useEffect } from "react";
import { Helmet } from "@/lib/head";

const NotFound = () => {
  const location = useLocation();

  useEffect(() => {
    console.error("404 Error: User attempted to access non-existent route:", location.pathname);
  }, [location.pathname]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted">
      <Helmet>
        <title>ไม่พบหน้าที่ค้นหา (404) — ร้านนัฐภรณ์ เชียงกลาง</title>
        <meta name="description" content="ไม่พบหน้าที่คุณกำลังค้นหา กลับไปยังหน้าหลักของร้านนัฐภรณ์ เชียงกลาง" />
        <meta name="robots" content="noindex" />
      </Helmet>
      <div className="mx-auto w-full max-w-md px-4 text-center">
        <h1 className="mb-2 text-4xl font-bold">404</h1>
        <p className="mb-2 text-lg text-muted-foreground">ไม่พบหน้านี้</p>
        <code className="mb-5 block break-all rounded-lg bg-card px-3 py-2 text-xs text-muted-foreground">
          {location.pathname}
        </code>
        <div className="flex flex-wrap justify-center gap-2 text-sm">
          <Link className="rounded-xl bg-primary px-4 py-2 text-primary-foreground" to="/admin/home">
            ไปหน้าแดชบอร์ด
          </Link>
          <Link className="rounded-xl border bg-card px-4 py-2" to="/">
            หน้าแรก
          </Link>
          <button className="rounded-xl border bg-card px-4 py-2" onClick={() => window.history.back()}>
            ย้อนกลับ
          </button>
        </div>
      </div>
    </div>
  );
};

export default NotFound;
