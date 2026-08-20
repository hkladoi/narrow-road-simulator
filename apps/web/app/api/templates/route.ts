import { getDbClient } from "@nrs/db";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    const templates = await getDbClient().scenarioTemplate.findMany({ orderBy: { name: "asc" } });
    return NextResponse.json({ templates });
  } catch (error) {
    return NextResponse.json(
      {
        message: "Không đọc được template từ PostgreSQL.",
        detail: error instanceof Error ? error.message : "unknown",
      },
      { status: 503 },
    );
  }
}
