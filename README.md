# Narrow Road Vehicle Simulator

Workbench mô phỏng hình học 2D cho đường hẹp: dựng mặt bằng theo mét, lái xe theo mô hình
động học bicycle, phát hiện va chạm, lập quỹ đạo tiến/lùi và phát lại hướng dẫn bằng tiếng Việt.

> Đây là công cụ học tập và mô phỏng hình học. Kết quả không thay thế quan sát trực tiếp,
> cảm biến, người xi-nhan hoặc quyết định an toàn ngoài thực tế.

## Chức năng

- Năm fixture hình học: ngõ chữ L, ngõ chữ T, ngõ cụt, cổng hẹp và quay đầu đường hẹp.
- Trình dựng cảnh Konva có snap, kéo/thả, undo/redo và chỉnh thuộc tính.
- Lái tay theo bước thời gian cố định, có kẹp trạng thái ngay trước va chạm.
- Hybrid A* chạy trong Web Worker, cho phép hủy, giới hạn thời gian/số nút, lấy mẫu va
  chạm toàn primitive và hậu kiểm toàn quỹ đạo.
- Kết nối giải tích Reeds–Shepp cho hai họ thẳng `S+`/`S-`; trường hợp cong hoặc có cusp
  được giải bằng Hybrid A*.
- Tra cứu xe theo PostgreSQL trước; Brave Search chỉ chạy ở server khi dữ liệu cục bộ chưa
  đủ, luôn lưu nguồn và yêu cầu người dùng xác nhận ứng viên.
- Hướng dẫn lái và playback xác định (deterministic), hỗ trợ tiến/lùi và tốc độ phát lại.

## Yêu cầu

- Node.js 24+
- pnpm 11.19+
- PostgreSQL 16+ hoặc Docker Desktop

## Khởi chạy

```powershell
pnpm install
Copy-Item .env.example .env
docker compose up -d postgres
pnpm --filter @nrs/db db:migrate:deploy
pnpm --filter @nrs/db db:seed
pnpm dev
```

PostgreSQL trong `docker-compose.yml` dùng cổng host `5433`. Chỉ đặt
`BRAVE_SEARCH_API_KEY` ở môi trường server khi cần fallback web; tìm kiếm xe có sẵn trong DB
không gọi Brave.

## Kiểm định

```powershell
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm audit:contrast
pnpm exec playwright install chromium
pnpm test:e2e
```

E2E chạy Chromium ở desktop và các viewport 320, 375, 414, 768 px. Bộ unit/regression
bao phủ hình học, động học, va chạm, catalog, planner, hướng dẫn, playback và cả năm fixture
đường chuẩn.

## Cấu trúc

- `apps/web`: Next.js App Router, API route, Konva workbench và Web Worker.
- `packages/domain`: hợp đồng dữ liệu, scene và fixture chuẩn.
- `packages/geometry`, `vehicle-model`, `collision`, `simulator`: lõi mô phỏng độc lập UI.
- `packages/planner`, `guidance`, `playback`: lập kế hoạch và diễn giải quỹ đạo.
- `packages/vehicle-catalog`, `db`: pipeline dữ liệu xe, Prisma schema, migration và seed.

Toàn bộ hình học miền dùng mét và radian; pixel chỉ xuất hiện trong lớp render trình duyệt.
