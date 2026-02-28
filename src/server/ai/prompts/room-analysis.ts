export interface RoomPromptInput {
  name: string;
  area: number;
  totalAreaForType: number;
  roomCount: number;
  allLabels?: string[];
}

export function buildRoomAnalysisPrompt(
  rooms: RoomPromptInput[],
  codeContext: string,
  includeAC: boolean,
): string {
  const roomsBlock = rooms
    .map((r, i) => {
      const labelsStr =
        r.allLabels && r.allLabels.length > 1
          ? ` (all text inside boundary: ${r.allLabels.map((l) => `"${l}"`).join(", ")})`
          : "";
      const countStr =
        r.roomCount > 1
          ? ` ×${r.roomCount} rooms — total area for type: ${r.totalAreaForType.toFixed(2)} m²`
          : "";
      return `${i + 1}. "${r.name}"${labelsStr}${countStr} — this instance: ${r.area.toFixed(2)} m² | TOTAL AREA FOR TYPE: ${r.totalAreaForType.toFixed(2)} m²`;
    })
    .join("\n");

  return `You are an expert in the Saudi Electricity Company Load Estimation Standard DPS-01.

Your task is to BOTH classify each room AND extract its load estimation values in a single pass.

AC_PREFERENCE = ${includeAC ? "true (include AC loads — use Table 8 three-phase L-L 400V)" : "false (no AC — use lights + sockets only version if available)"}

══════════════════════════════════════════════════════════════
PART 1 — CLASSIFICATION: DPS-01 TABLE 2 CATEGORY DEFINITIONS
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
If the drawing shows multiple uses (e.g. ground floor shops + upper floor apartments),
classify each zone to its own category.

RULE 4 — C18–C29 FLAG
For any C18–C29 room, append to codeReference:
  "Declared Load Method required — area-based density not applicable (DPS-01 Section 20)"

══════════════════════════════════════════════════════════════
PART 2 — LOAD VALUES: EXTRACT FROM DPS-01 FOR EACH CATEGORY
══════════════════════════════════════════════════════════════

For each room, after determining its category, extract these values:

1. LOAD DENSITY (VA/m²) — loadDensityVAm2
   ${includeAC ? "Use Table 8 (three-phase L-L 400V) — includes Lights + AC + Power Sockets." : "Look for a version excluding AC (Not table 8). If no AC-free value exists use the standard value and note it in loadsIncluded."}

   SPECIAL — C1 (Residential) and C2 (Commercial Shops):
   These use an area→kVA table method (Tables 3–6), NOT a flat VA/m² figure.
   • C1: use Table 4 (three-phase L-L 400V)
   • C2: use Table 6 (three-phase L-L 400V)
   The TOTAL AREA FOR TYPE is given for each room in the input.
   Steps:
     a. Locate the two table rows that bracket the given total area.
     b. Linearly interpolate to get the kVA for that area.
        If area exceeds the table maximum, use the extended formula (VA/m²) from the
        footnote or Section 16 and multiply by the total area to get kVA.
     c. Convert: loadDensityVAm2 = (interpolated_kVA × 1000) / totalAreaForType
   Return the final VA/m² result directly — do NOT return the kVA table.

   SPECIAL — C11 (Common Areas):
   C11 density may appear separately from the main Table 8 grid.
   Search for: "common area", "shared services", "corridor", "emergency lighting",
   "public area", "building services" load density mentions.
   C11 density is typically much lower than habitable areas.
   If truly not found: return loadDensityVAm2 = 0 and note in codeReference.

   SPECIAL — C18–C29 (Declared Load): return loadDensityVAm2 = 0.

2. DEMAND FACTOR — demandFactor
   Single flat value from DPS-01 Table 11. One value per category row.
   Convert percentages: 60% → 0.60. If not found: return 1.0.

3. LOADS INCLUDED — loadsIncluded
   Copy the exact description from the table header or footnote.
   Example: "Lights + Air Conditioning + Power Sockets"

══════════════════════════════════════════════════════════════
DPS-01 CODE SECTIONS (retrieved):
${codeContext.trim() || "NO SECTIONS RETRIEVED — rely on Table 2 definitions. Set all load values to 0 and note 'Not found in retrieved sections'."}
══════════════════════════════════════════════════════════════

ROOMS FROM DXF DRAWING:
${roomsBlock}

══════════════════════════════════════════════════════════════
STRICT RULES:
• Extract values ONLY from the retrieved sections above.
• Do NOT guess or use knowledge not in the retrieved text.
• If a value is not in the retrieved text: set numeric field to 0 and write
  "Not found in retrieved sections" in codeReference.
• All demand factors must be in range 0–1 (convert from % if needed).
• Return exactly ${rooms.length} entries — one per room label above.`;
}
