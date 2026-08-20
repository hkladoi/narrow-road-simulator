import { getDbClient } from "@nrs/db";
import { parseScene } from "@nrs/domain";
import { NextResponse } from "next/server";
import { z } from "zod";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  try {
    const scenario = await getDbClient().scenario.findUnique({ where: { id } });
    return scenario
      ? NextResponse.json({ scenario })
      : NextResponse.json({ message: "Không tìm thấy kịch bản." }, { status: 404 });
  } catch (error) {
    return NextResponse.json(
      {
        message: "Không đọc được kịch bản.",
        detail: error instanceof Error ? error.message : "unknown",
      },
      { status: 503 },
    );
  }
}

export async function PUT(request: Request, context: RouteContext) {
  const { id } = await context.params;
  try {
    const payload = z
      .object({ name: z.string().trim().min(1).max(160), scene: z.unknown() })
      .parse(await request.json());
    const scene = parseScene(payload.scene);
    const scenario = await getDbClient().scenario.update({
      where: { id },
      data: {
        name: payload.name,
        sceneJson: scene,
        ...(scene.vehicle
          ? { vehicleProfileJson: scene.vehicle, startPoseJson: scene.vehicle.pose }
          : {}),
        ...(scene.goal ? { goalJson: scene.goal } : {}),
        safetyMarginM: scene.safetyMarginM ?? 0,
        version: scene.version,
      },
    });
    return NextResponse.json({ scenario });
  } catch (error) {
    if (error instanceof z.ZodError)
      return NextResponse.json(
        { message: "Dữ liệu kịch bản không hợp lệ.", issues: error.issues },
        { status: 400 },
      );
    return NextResponse.json(
      {
        message: "Không cập nhật được kịch bản.",
        detail: error instanceof Error ? error.message : "unknown",
      },
      { status: 503 },
    );
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  try {
    await getDbClient().scenario.delete({ where: { id } });
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return NextResponse.json(
      {
        message: "Không xóa được kịch bản.",
        detail: error instanceof Error ? error.message : "unknown",
      },
      { status: 503 },
    );
  }
}
