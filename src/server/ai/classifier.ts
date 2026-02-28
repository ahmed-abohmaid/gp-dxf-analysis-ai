import { generateText, Output } from "ai";
import { z } from "zod";

import { geminiFlash } from "@/server/ai/gemini-client";

export interface RoomInput {
  name: string;
  area: number;
  totalAreaForType: number;
  roomCount: number;
  allLabels?: string[];
}

const ClassificationSchema = z.object({
  classifications: z.array(
    z.object({
      roomLabel: z.string().describe("Exact room label as given in the input — copy verbatim"),
      roomType: z
        .string()
        .describe("Normalised English room type, e.g. 'Master Bedroom', 'Corridor'"),
      customerCategory: z.string().describe("DPS-01 customer category code: one of C1 … C29"),
      codeReference: z
        .string()
        .describe("DPS-01 section used, e.g. 'DPS-01 Table 2 — Customer Classification'"),
      classificationReason: z
        .string()
        .describe("One sentence: why this room maps to the chosen category"),
    }),
  ),
});

export type Classification = z.infer<typeof ClassificationSchema>["classifications"][number];

function buildClassificationPrompt(rooms: RoomInput[], codeContext: string): string {
  const roomsBlock = rooms
    .map((r, i) => {
      const allLabelsStr =
        r.allLabels && r.allLabels.length > 1
          ? ` (all text inside boundary: ${r.allLabels.map((l) => `"${l}"`).join(", ")})`
          : "";
      const countStr =
        r.roomCount > 1
          ? ` ×${r.roomCount} rooms — total area: ${r.totalAreaForType.toFixed(2)} m²`
          : "";
      return `${i + 1}. "${r.name}"${allLabelsStr}${countStr} — this instance: ${r.area.toFixed(2)} m²`;
    })
    .join("\n");

  return `You are an expert in the Saudi Electricity Company Load Estimation Standard DPS-01.

Your ONLY task is to classify each room in a building floor plan to the correct
DPS-01 customer category (C1–C29).

DO NOT output any numbers.
DO NOT output load densities, demand factors, or any calculated values.
Those are extracted from the code separately after you return category codes.

══════════════════════════════════════════════════════════════
DPS-01 TABLE 2 — CUSTOMER CATEGORY DEFINITIONS
(Use as your primary reference. Retrieved text below may add detail.)
══════════════════════════════════════════════════════════════

C1  — Normal Residential Dwelling
      Villas, houses, apartments — each unit with its own KWH meter.
      Rooms: bedroom, master bedroom, living room, dining room, kitchen, bathroom,
      maid room, study, prayer room (ancillary), balcony, store room within unit.

C2  — Normal Commercial Shops
      Individual retail units, pharmacies, small commercial offices —
      each with its own KWH meter.

C3  — Furnished Flats / Serviced Apartments
      Fully furnished rental apartments, hotel apartments, short-stay units.

C4  — Hotels and Motels
      Full-service hotels, motels, resorts.

C5  — Hospitals and Medical Centres
      In-patient hospitals, surgery centres, specialist medical facilities.

C6  — Schools, Colleges and Educational Institutes
      Primary, secondary, university, training institutes.

C7  — Offices
      All office types: corporate, private, government administration.
      Rooms: open-plan office, private office, meeting room, boardroom,
      reception within an office building, print room, server room in office.

C8  — Banks and Financial Institutions

C9  — Government and Public Buildings
      Ministries, courts, municipalities, public service buildings.

C10 — Restaurants, Cafes and Food Service
      Dine-in restaurants, fast food, cafeterias, coffee shops.

C11 — Common Areas and Services in Buildings
      ALL shared and circulation spaces within ANY building type.
      Rooms: corridor, hallway, lobby, entrance hall, staircase, stairwell,
      lift shaft, lift lobby, plant room, generator room, electrical room,
      pump room, service shaft, shared toilet / WC, fire escape corridor,
      bin room, security room, building management room.
      ALWAYS use C11 for these — regardless of what the rest of the building is.

C12 — Supermarkets and Shopping Centres
      Large retail, hypermarkets, shopping malls.

C13 — Indoor Car Parks and Garages
      Standalone multi-storey parking, basement car parks as primary use.

C14 — Outdoor Car Parks and Petrol / Service Stations

C15 — Car Showrooms and Automobile Dealerships

C16 — Wedding Halls, Ballrooms and Social Clubs

C17 — Sports Facilities, Gyms and Recreation Centres
      Gyms, swimming pools, sports halls, courts, stadiums.

C18 — Warehouses and Storage Facilities (Declared Load Method)

C19 — Light Industrial / Workshops (Declared Load Method)

C20 — Heavy Industrial (Declared Load Method)

C21 — Mosques and Places of Worship

C22 — Exhibition Centres and Conference Halls

C23 — Cinemas, Theatres and Entertainment Venues

C24 — Nurseries and Kindergartens

C25 — Libraries and Cultural Centres

C26 — Laundry and Dry-Cleaning Facilities

C27 — Laboratories and Research Centres

C28 — Fire Stations, Civil Defence and Emergency Services

C29 — Mixed-Use Facilities
      Buildings with two or more distinct uses sharing one meter.

══════════════════════════════════════════════════════════════
CLASSIFICATION RULES
══════════════════════════════════════════════════════════════

RULE 1 — BUILDING-LEVEL DECISION
Look at the full room list together. The customer category is the building's
primary use — assign it to all rooms of that use.
Exception: always use C11 for all circulation and service spaces.

RULE 2 — LABEL TRANSLATION
Labels may be in Arabic, abbreviated, or coded.
Use all text inside the room boundary AND the room area to determine type.
Ignore sheet refs (AZ451), door tags (DT01), dimension text — CAD artifacts.

Arabic quick-reference:
  غرفة نوم / غرفة    → Bedroom
  صالة / معيشة       → Living Room
  مطبخ               → Kitchen
  حمام / دورة مياه   → Bathroom
  ممر / مدخل         → Corridor / Entrance
  درج / سلم          → Staircase
  مصعد               → Lift / Elevator
  مكتب               → Office
  متجر / محل         → Shop
  مصلى               → Prayer Room
  مخزن               → Store Room
  غرفة خادمة         → Maid Room
  قاعة               → Hall / Meeting Room

RULE 3 — MIXED-USE BUILDINGS
If the drawing clearly shows multiple uses (e.g. ground floor shops + upper floor apartments),
classify each zone to its own category. Multiple codes may appear in the output.

RULE 4 — C18–C29 FLAG
For any C18–C29 room, append to codeReference:
  "Declared Load Method required — area-based density not applicable (DPS-01 Section 20)"

══════════════════════════════════════════════════════════════
DPS-01 CLASSIFICATION TEXT (retrieved):
${codeContext.trim() || "NO SECTIONS RETRIEVED — rely on Table 2 definitions above."}
══════════════════════════════════════════════════════════════

ROOMS FROM DXF DRAWING:
${roomsBlock}

══════════════════════════════════════════════════════════════
Return exactly ${rooms.length} entries — one per room label above.`;
}

/**
 * Phase 1: classifies rooms to DPS-01 category codes only.
 * No numerical values are produced — densities and factors come from Phase 2.
 *
 * @throws Error on AI failure (caller decides how to handle)
 */
export async function classifyRooms(rooms: RoomInput[], codeContext: string) {
  const { output } = await generateText({
    model: geminiFlash,
    output: Output.object({ schema: ClassificationSchema }),
    prompt: buildClassificationPrompt(rooms, codeContext),
  });

  if (!output?.classifications) {
    console.error("[classifyRooms] Gemini returned null or malformed output");
    return [];
  }

  return output.classifications;
}
