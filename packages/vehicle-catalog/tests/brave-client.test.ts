import { describe, expect, it, vi } from "vitest";

import { BraveSearchVehicleClient, extractVehicleEvidence, parseBraveCandidates } from "../src";

describe("Brave candidate parser", () => {
  it("returns candidate-only records without inventing dimensions", () => {
    const candidates = parseBraveCandidates("VF5", [
      {
        title: "VinFast VF 5 - Specifications",
        url: "https://vinfastauto.example/vf5",
        description: "VinFast VF5 electric vehicle details",
      },
    ]);
    expect(candidates).toEqual([
      expect.objectContaining({
        displayName: "VinFast VF 5",
        manufacturer: "VinFast",
        model: "VF 5",
        dataStatus: "CANDIDATE_ONLY",
        source: "WEB",
      }),
    ]);
  });
});

describe("Brave evidence extraction", () => {
  it("normalizes dimensions and derives radius from turning circle with provenance", () => {
    const evidence = extractVehicleEvidence(
      [
        {
          title: "VF 5 technical specifications",
          url: "https://vinfastauto.example/spec",
          description:
            "Overall length: 3,967 mm. Width excluding mirrors: 1,723 mm. Wheelbase: 2,514 mm. Front overhang: 730 mm. Rear overhang: 723 mm. Minimum turning circle: 9.4 m.",
        },
      ],
      "VinFast",
      new Date("2026-08-20T00:00:00Z"),
    );
    expect(evidence.find((item) => item.fieldName === "lengthM")?.valueNormalized).toBeCloseTo(
      3.967,
    );
    expect(evidence.find((item) => item.fieldName === "minTurnRadiusM")).toMatchObject({
      valueNormalized: 4.7,
      sourceType: "DERIVED",
      formula: "turningCircleM / 2",
      formulaInputs: { turningCircleM: 9.4 },
    });
  });

  it("keeps the subscription token in the server-side request header", async () => {
    const fetchMock = vi.fn<typeof fetch>((_input, init) => {
      expect(new Headers(init?.headers).get("X-Subscription-Token")).toBe("server-secret");
      return Promise.resolve(
        new Response(JSON.stringify({ web: { results: [] } }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );
    });
    const client = new BraveSearchVehicleClient("server-secret", fetchMock);
    await client.searchCandidates("VF5", new AbortController().signal);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
