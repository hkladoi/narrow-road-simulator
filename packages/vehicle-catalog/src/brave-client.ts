import { z } from "zod";

import type {
  BraveResolvedVehicle,
  BraveVehicleClient,
  VehicleCandidate,
  VehicleSpecEvidence,
  VehicleSpecField,
} from "./contracts";
import { dedupeCandidates, normalizeVehicleText, parseLengthToMeters } from "./normalization";

const BRAVE_WEB_SEARCH_ENDPOINT = "https://api.search.brave.com/res/v1/web/search";

const braveWebResultSchema = z.object({
  title: z.string(),
  url: z.url(),
  description: z.string().optional(),
  extra_snippets: z.array(z.string()).optional(),
});

const braveResponseSchema = z.object({
  web: z
    .object({
      results: z.array(braveWebResultSchema).default([]),
    })
    .optional(),
});

type BraveWebResult = z.infer<typeof braveWebResultSchema>;

function stripMarkup(value: string): string {
  return value
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function candidateNameFromTitle(title: string): string {
  const clean = stripMarkup(title);
  const firstSegment = clean.split(/\s+[|–—-]\s+/)[0]?.trim();
  return firstSegment ?? clean;
}

export function parseBraveCandidates(
  query: string,
  results: readonly BraveWebResult[],
): readonly VehicleCandidate[] {
  const normalizedQuery = normalizeVehicleText(query);
  const candidates = results
    .map((result): VehicleCandidate | undefined => {
      const displayName = candidateNameFromTitle(result.title);
      const combined = normalizeVehicleText(
        [displayName, result.description, ...(result.extra_snippets ?? [])]
          .filter(Boolean)
          .join(" "),
      );
      if (!combined.includes(normalizedQuery)) return undefined;
      const tokens = displayName.split(/\s+/).filter(Boolean);
      const manufacturer = tokens.length > 1 ? tokens[0] : undefined;
      const model = tokens.length > 1 ? tokens.slice(1).join(" ") : displayName;
      const yearMatch = /\b(19\d{2}|20\d{2})\b/.exec(displayName);
      return {
        displayName,
        model,
        dataStatus: "CANDIDATE_ONLY",
        source: "WEB",
        ...(manufacturer ? { manufacturer } : {}),
        ...(yearMatch?.[1] ? { modelYear: Number.parseInt(yearMatch[1], 10) } : {}),
        canonicalKey: [manufacturer, model, yearMatch?.[1]]
          .filter((part): part is string => Boolean(part))
          .map(normalizeVehicleText)
          .join(":"),
      };
    })
    .filter((candidate): candidate is VehicleCandidate => candidate !== undefined);
  return dedupeCandidates(candidates);
}

type EvidencePattern = Readonly<{
  fieldName: VehicleSpecField;
  expression: RegExp;
  kind: "length" | "angle" | "turning-circle";
}>;

const EVIDENCE_PATTERNS: readonly EvidencePattern[] = [
  {
    fieldName: "lengthM",
    expression: /\b(?:overall\s+)?length\b[^\d]{0,24}([\d,.]+)\s*(mm|cm|m|in|inches|ft)\b/i,
    kind: "length",
  },
  {
    fieldName: "widthM",
    expression:
      /\b(?:overall\s+)?width(?:\s+excluding\s+mirrors)?\b[^\d]{0,24}([\d,.]+)\s*(mm|cm|m|in|inches|ft)\b/i,
    kind: "length",
  },
  {
    fieldName: "wheelbaseM",
    expression: /\bwheelbase\b[^\d]{0,24}([\d,.]+)\s*(mm|cm|m|in|inches|ft)\b/i,
    kind: "length",
  },
  {
    fieldName: "frontOverhangM",
    expression: /\bfront\s+overhang\b[^\d]{0,24}([\d,.]+)\s*(mm|cm|m|in|inches|ft)\b/i,
    kind: "length",
  },
  {
    fieldName: "rearOverhangM",
    expression: /\brear\s+overhang\b[^\d]{0,24}([\d,.]+)\s*(mm|cm|m|in|inches|ft)\b/i,
    kind: "length",
  },
  {
    fieldName: "trackWidthM",
    expression:
      /\b(?:front|rear)?\s*track\s+width\b[^\d]{0,24}([\d,.]+)\s*(mm|cm|m|in|inches|ft)\b/i,
    kind: "length",
  },
  {
    fieldName: "minTurnRadiusM",
    expression:
      /\b(?:minimum\s+)?turning\s+radius\b[^\d]{0,24}([\d,.]+)\s*(mm|cm|m|in|inches|ft)\b/i,
    kind: "length",
  },
  {
    fieldName: "minTurnRadiusM",
    expression:
      /\b(?:minimum\s+)?turning\s+(?:circle|diameter)\b[^\d]{0,24}([\d,.]+)\s*(mm|cm|m|in|inches|ft)\b/i,
    kind: "turning-circle",
  },
  {
    fieldName: "maxSteerRad",
    expression:
      /\b(?:maximum|max\.?|full[- ]lock)\s+steer(?:ing)?\s+angle\b[^\d]{0,24}([\d,.]+)\s*(?:°|deg|degrees?)\b/i,
    kind: "angle",
  },
];

export function extractVehicleEvidence(
  results: readonly BraveWebResult[],
  manufacturer?: string,
  retrievedAt = new Date(),
): readonly VehicleSpecEvidence[] {
  const normalizedManufacturer = manufacturer ? normalizeVehicleText(manufacturer) : "";
  const evidence: VehicleSpecEvidence[] = [];
  for (const [resultIndex, result] of results.entries()) {
    const text = stripMarkup(
      [result.title, result.description, ...(result.extra_snippets ?? [])]
        .filter(Boolean)
        .join(". "),
    );
    const sourceMatchesManufacturer =
      normalizedManufacturer.length > 0 &&
      normalizeVehicleText(result.url).includes(normalizedManufacturer);
    const confidence = sourceMatchesManufacturer ? 0.95 : Math.max(0.65, 0.85 - resultIndex * 0.03);
    for (const pattern of EVIDENCE_PATTERNS) {
      const match = pattern.expression.exec(text);
      const rawValue = match?.[1];
      const unit = match?.[2];
      if (!rawValue) continue;
      let valueNormalized: number;
      let sourceType: VehicleSpecEvidence["sourceType"] = "DIRECT";
      let formula: string | undefined;
      let formulaInputs: Readonly<Record<string, number>> | undefined;
      if (pattern.kind === "angle") {
        valueNormalized = (Number.parseFloat(rawValue.replaceAll(",", "")) * Math.PI) / 180;
      } else {
        const meters = parseLengthToMeters(rawValue, unit);
        if (pattern.kind === "turning-circle") {
          valueNormalized = meters / 2;
          sourceType = "DERIVED";
          formula = "turningCircleM / 2";
          formulaInputs = { turningCircleM: meters };
        } else {
          valueNormalized = meters;
        }
      }
      evidence.push({
        fieldName: pattern.fieldName,
        valueRaw: match[0],
        valueNormalized,
        sourceUrl: result.url,
        sourceTitle: stripMarkup(result.title),
        sourceType,
        confidence,
        retrievedAt,
        ...(unit ? { unitRaw: unit } : {}),
        ...(formula ? { formula } : {}),
        ...(formulaInputs ? { formulaInputs } : {}),
      });
    }
  }
  const unique = new Map<string, VehicleSpecEvidence>();
  for (const item of evidence) {
    const key = [item.fieldName, item.sourceUrl, item.valueNormalized ?? item.valueRaw].join(":");
    if (!unique.has(key)) unique.set(key, item);
  }
  return [...unique.values()];
}

async function abortableDelay(milliseconds: number, signal: AbortSignal): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(resolve, milliseconds);
    signal.addEventListener(
      "abort",
      () => {
        clearTimeout(timeout);
        reject(new DOMException("Request aborted", "AbortError"));
      },
      { once: true },
    );
  });
}

export class BraveSearchVehicleClient implements BraveVehicleClient {
  public constructor(
    private readonly apiKey: string,
    private readonly fetchImplementation: typeof fetch = fetch,
  ) {
    if (!apiKey.trim())
      throw new Error("BRAVE_SEARCH_API_KEY is required for Brave vehicle search.");
  }

  private async webSearch(query: string, signal: AbortSignal): Promise<readonly BraveWebResult[]> {
    const url = new URL(BRAVE_WEB_SEARCH_ENDPOINT);
    url.searchParams.set("q", query);
    url.searchParams.set("count", "20");
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const response = await this.fetchImplementation(url, {
        method: "GET",
        headers: {
          Accept: "application/json",
          "X-Subscription-Token": this.apiKey,
        },
        signal,
      });
      if (response.ok) {
        const parsed = braveResponseSchema.parse(await response.json());
        return parsed.web?.results ?? [];
      }
      if ((response.status === 429 || response.status >= 500) && attempt === 0) {
        await abortableDelay(200, signal);
        continue;
      }
      throw new Error(`Brave Search request failed with status ${String(response.status)}.`);
    }
    return [];
  }

  public async searchCandidates(
    query: string,
    signal: AbortSignal,
  ): Promise<readonly VehicleCandidate[]> {
    const results = await this.webSearch(`${query} car model vehicle`, signal);
    return parseBraveCandidates(query, results);
  }

  public async resolveSpecs(
    candidate: VehicleCandidate,
    signal: AbortSignal,
  ): Promise<BraveResolvedVehicle> {
    const identity = [
      candidate.manufacturer,
      candidate.model ?? candidate.displayName,
      candidate.trim,
      candidate.modelYear?.toString(),
      candidate.market,
    ]
      .filter((part): part is string => Boolean(part))
      .join(" ");
    const [dimensions, turning] = await Promise.all([
      this.webSearch(
        `${identity} official technical specifications overall length width wheelbase front rear overhang`,
        signal,
      ),
      this.webSearch(
        `${identity} official minimum turning radius turning circle maximum steering angle`,
        signal,
      ),
    ]);
    const manufacturer =
      candidate.manufacturer ?? candidate.displayName.split(/\s+/)[0] ?? "Unknown";
    const model = candidate.model ?? candidate.displayName;
    return {
      manufacturer,
      model,
      displayName: candidate.displayName,
      category: "custom",
      aliases: [candidate.displayName, [manufacturer, model].join(" ")],
      evidence: extractVehicleEvidence([...dimensions, ...turning], manufacturer),
      ...(candidate.generation ? { generation: candidate.generation } : {}),
      ...(candidate.trim ? { trim: candidate.trim } : {}),
      ...(candidate.market ? { market: candidate.market } : {}),
      ...(candidate.modelYear !== undefined ? { modelYear: candidate.modelYear } : {}),
    };
  }
}
