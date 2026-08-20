import { vehicleCandidateSchema } from "@nrs/vehicle-catalog";
import { getVehicleCatalogService } from "../../../../lib/catalog-server";
import { consumeRateLimit } from "../../../../lib/rate-limit";
import { NextResponse } from "next/server";
import { z } from "zod";

export async function POST(request: Request) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  if (!consumeRateLimit(`vehicle-resolve:${ip}`, 8))
    return NextResponse.json(
      { message: "Đã vượt giới hạn 8 lượt xác minh mỗi phút. Hãy thử lại sau." },
      { status: 429 },
    );
  try {
    const candidate = vehicleCandidateSchema.parse(await request.json());
    return NextResponse.json(await getVehicleCatalogService().resolve(candidate));
  } catch (error) {
    if (error instanceof z.ZodError)
      return NextResponse.json(
        { message: "Ứng viên xe không hợp lệ.", issues: error.issues },
        { status: 400 },
      );
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Không thể xác minh xe." },
      { status: 503 },
    );
  }
}
