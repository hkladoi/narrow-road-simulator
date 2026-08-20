import { getDbClient } from "@nrs/db";
import { parseScene } from "@nrs/domain";
import { NextResponse } from "next/server";
import { z } from "zod";

const createScenarioSchema = z.object({
  name: z.string().trim().min(1).max(160),
  scene: z.unknown(),
});

export async function GET() {
  try {
    const scenarios = await getDbClient().scenario.findMany({
      orderBy: { updatedAt: "desc" },
      take: 100,
    });
    return NextResponse.json({ scenarios });
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

export async function POST(request: Request) {
  try {
    const payload = createScenarioSchema.parse(await request.json());
    const scene = parseScene(payload.scene);
    const created = await getDbClient().scenario.create({
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
    return NextResponse.json({ scenario: created }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError)
      return NextResponse.json(
        { message: "Dữ liệu kịch bản không hợp lệ.", issues: error.issues },
        { status: 400 },
      );
    return NextResponse.json(
      {
        message: "Không lưu được kịch bản.",
        detail: error instanceof Error ? error.message : "unknown",
      },
      { status: 503 },
    );
  }
}
