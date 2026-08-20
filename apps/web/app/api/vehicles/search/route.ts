import { getVehicleCatalogService } from "../../../../lib/catalog-server";
import { consumeRateLimit } from "../../../../lib/rate-limit";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  if (!consumeRateLimit(`vehicle-search:${ip}`))
    return NextResponse.json(
      { message: "Đã vượt giới hạn 20 lượt tìm mỗi phút. Hãy thử lại sau." },
      { status: 429 },
    );
  const query = new URL(request.url).searchParams.get("query")?.trim() ?? "";
  if (!query || query.length > 120)
    return NextResponse.json(
      { message: "Từ khóa xe phải có từ 1 đến 120 ký tự." },
      { status: 400 },
    );
  try {
    return NextResponse.json(await getVehicleCatalogService().search(query));
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Không thể tìm xe." },
      { status: 503 },
    );
  }
}
