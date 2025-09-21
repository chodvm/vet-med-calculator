"use client";
// Vet Med Drug Calculator (v3.4.5) — src
import React, { useEffect, useMemo, useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Printer, RefreshCw, Search } from "lucide-react";

// -----------------------------
// Types & helpers
// -----------------------------

type Species = "dog" | "cat" | "rabbit" | "gpig" | "rat" | "all";
type SpeciesDose = Partial<Record<Exclude<Species, "all">, { min: number; max: number }>>;
type Presentation = { label: string; kind: "liquid" | "solid"; value: number };

type Drug = {
  id: string;
  name: string;
  category: string;
  species: Species[];
  unitLabel?: string; // e.g., mg/kg or mcg/kg
  doseMin?: number;
  doseMax?: number;
  doseRanges?: SpeciesDose; // species overrides
  presentations?: Presentation[];
  route?: string;
  notes?: string;
};

type SelectedItem = {
  id: string;
  name: string;
  category: string;
  route?: string;
  unitLabel?: string;
  dose?: number;
  presentation?: Presentation;
  resultText: string;
  notes?: string;
};

const toNum = (v: any, fb = 0) => (isFinite(Number(v)) ? Number(v) : fb);
const round = (n: number, d = 2) => {
  const p = 10 ** d;
  const x = typeof n === "number" && isFinite(n) ? n : 0;
  return Math.round((x + Number.EPSILON) * p) / p;
};
const kgFrom = (v: number, unit: "kg" | "lb") => (unit === "kg" ? v : v * 0.45359237);
export const computeDoseMg = (doseMgPerKg: number, weightKg: number) =>
  (toNum(doseMgPerKg) * Math.max(0, toNum(weightKg))) || 0;

// Input cleaning utilities for "free-deletable" numeric text inputs
function cleanNumericInput(raw: string, maxDecimals = 4) {
  if (raw === "") return ""; // allow empty while typing
  // keep digits and dots, collapse multiple dots to one (first dot wins)
  let s = raw.replace(/[^0-9.]/g, "");
  const firstDot = s.indexOf(".");
  if (firstDot !== -1) {
    const head = s.slice(0, firstDot + 1);
    const tail = s.slice(firstDot + 1).replace(/\./g, "");
    s = head + tail;
  }
  // limit decimal places
  if (s.includes(".")) {
    const [a, b] = s.split(".");
    s = `${a}.${b.slice(0, maxDecimals)}`;
  }
  return s;
}

function normalizeNumericText(raw: string, maxDecimals = 4) {
  // Trim, clean, and strip leading zeros (but preserve "0." pattern)
  const cleaned = cleanNumericInput(raw, maxDecimals);
  if (cleaned === "") return "";
  const n = Number(cleaned);
  if (!isFinite(n)) return "";
  // toFixed would pad zeros; we want minimal but bounded decimals
  const parts = cleaned.split(".");
  const decimals = parts[1]?.length ?? 0;
  const d = Math.min(decimals, maxDecimals);
  const scaled = Math.round(n * 10 ** d) / 10 ** d;
  return String(scaled);
}

function getActiveRange(drug: Drug, species: Exclude<Species, "all">) {
  const sp = drug.doseRanges?.[species];
  if (sp) return { min: sp.min, max: sp.max };
  if (drug.doseMin != null && drug.doseMax != null) return { min: drug.doseMin, max: drug.doseMax };
  return undefined;
}

// -----------------------------
// Seed data
// -----------------------------

const COMMON_DRUGS: Drug[] = [
  {
    id: "marop",
    name: "Maropitant (Cerenia)",
    category: "Antiemetic",
    species: ["dog", "cat"],
    unitLabel: "mg/kg",
    doseRanges: { dog: { min: 1, max: 1 }, cat: { min: 1, max: 1 } },
    presentations: [
      { label: "16 mg tab", kind: "solid", value: 16 },
      { label: "24 mg tab", kind: "solid", value: 24 },
      { label: "10 mg/mL", kind: "liquid", value: 10 },
    ],
    route: "SC/IV/PO",
  },
  {
    id: "butor",
    name: "Butorphanol",
    category: "Opioid",
    species: ["dog", "cat", "rabbit", "gpig", "rat"],
    unitLabel: "mg/kg",
    doseRanges: { dog: { min: 0.2, max: 0.4 }, cat: { min: 0.1, max: 0.4 } },
    presentations: [
      { label: "2 mg/mL", kind: "liquid", value: 2 },
      { label: "5 mg/mL", kind: "liquid", value: 5 },
      { label: "10 mg/mL", kind: "liquid", value: 10 },
    ],
    route: "IM/IV/SC",
  },
  {
    id: "amoxi",
    name: "Amoxicillin/Clavulanate",
    category: "Antibiotic",
    species: ["dog", "cat"],
    unitLabel: "mg/kg",
    doseMin: 12.5,
    doseMax: 25,
    presentations: [
      { label: "62.5 mg tab", kind: "solid", value: 62.5 },
      { label: "125 mg tab", kind: "solid", value: 125 },
      { label: "250 mg tab", kind: "solid", value: 250 },
      { label: "62.5 mg/mL", kind: "liquid", value: 62.5 },
      { label: "100 mg/mL", kind: "liquid", value: 100 },
    ],
    route: "PO",
    notes: "Side effects inlcude diarrhea.",
  },
];

const INJECTABLE_DRUGS: Drug[] = [
  {
    id: "ket",
    name: "Ketamine",
    category: "Dissociative",
    species: ["dog", "cat", "rabbit"],
    unitLabel: "mg/kg",
    doseRanges: { dog: { min: 2, max: 10 }, cat: { min: 2, max: 10 }, rabbit: { min: 2, max: 10 } },
    presentations: [{ label: "100 mg/mL", kind: "liquid", value: 100 }],
    route: "IM/IV",
    notes:
      "Avoid in significant cardiac disease or uncontrolled hypertension; increases sympathetic tone. Use caution with hyperthyroid cats. Consider alternative induction for HCM/CHF.",
  },
  {
    id: "prop_inj",
    name: "Propofol (inj)",
    category: "Induction",
    species: ["dog", "cat"],
    unitLabel: "mg/kg",
    doseRanges: { dog: { min: 2, max: 6 }, cat: { min: 2, max: 6 } },
    presentations: [{ label: "10 mg/mL", kind: "liquid", value: 10 }],
    route: "IV",
  },
  {
    id: "vetsu_inj",
    name: "Vetsulin (inj)",
    category: "Insulin",
    species: ["dog", "cat"],
    unitLabel: "U/kg",
    doseRanges: { dog: { min: 2, max: 6 }, cat: { min: 2, max: 6 } },
    presentations: [{ label: "10 U/mL", kind: "liquid", value: 10 }],
    route: "IV/IM",
  },
];

const ANES_DRUGS: Drug[] = [
  {
    id: "meth",
    name: "Methadone",
    category: "Opioid",
    species: ["dog", "cat", "rabbit"],
    unitLabel: "mg/kg",
    doseRanges: { dog: { min: 0.2, max: 0.5 }, cat: { min: 0.1, max: 0.3 }, rabbit: { min: 0.1, max: 0.3 } },
    presentations: [{ label: "10 mg/mL", kind: "liquid", value: 10 }],
    route: "IM/IV",
  },
  {
    id: "dexd",
    name: "Dexmedetomidine",
    category: "Alpha-2",
    species: ["dog", "cat"],
    unitLabel: "mg/kg",
    doseRanges: { dog: { min: 0.002, max: 0.01 }, cat: { min: 0.002, max: 0.008 } },
    presentations: [{ label: "0.5 mg/mL", kind: "liquid", value: 0.5 }],
    route: "IM/IV",
    notes: "Avoid in significant heart disease. Use caution in compromised cardiovascular patients.",
  },
  {
    id: "prop",
    name: "Propofol",
    category: "Induction",
    species: ["dog", "cat"],
    unitLabel: "mg/kg",
    doseRanges: { dog: { min: 2, max: 6 }, cat: { min: 2, max: 6 } },
    presentations: [{ label: "10 mg/mL", kind: "liquid", value: 10 }],
    route: "IV",
  },
];

const ALL_DRUGS: Drug[] = [...COMMON_DRUGS, ...ANES_DRUGS, ...INJECTABLE_DRUGS];

// -----------------------------
// App Component
// -----------------------------

export default function VetMedDrugCalculatorApp() {
  const [species, setSpecies] = useState<Exclude<Species, "all">>("dog");
  const [unit, setUnit] = useState<"kg" | "lb">("lb");
  // FREE-DELETABLE input: keep a string for the text box, parse separately
  const [weightText, setWeightText] = useState<string>("10");

  const weightKg = useMemo(() => {
    const numeric = toNum(weightText === "" ? 0 : weightText, 0);
    return kgFrom(numeric, unit);
  }, [weightText, unit]);

  const [globalQuery, setGlobalQuery] = useState("");
  const [onlyMySpecies, setOnlyMySpecies] = useState(true);
  const [selected, setSelected] = useState<Record<string, SelectedItem>>({});

  // ✅ Stable callbacks (prevents infinite update loops)
  const reset = useCallback(() => {
    setSpecies("dog");
    setUnit("lb");
    setWeightText("10");
    setGlobalQuery("");
    setOnlyMySpecies(true);
    setSelected({});
  }, []);

  const toggleSelected = useCallback((item: SelectedItem) => {
    setSelected((prev) => {
      const exists = !!prev[item.id];
      if (exists) {
        const { [item.id]: _omit, ...rest } = prev;
        return rest;
      }
      return { ...prev, [item.id]: item };
    });
  }, []);

  const updateSelected = useCallback((item: SelectedItem) => {
    setSelected((prev) => (prev[item.id] ? { ...prev, [item.id]: { ...prev[item.id], ...item } } : prev));
  }, []);

  const clearAllSelected = useCallback(() => setSelected({}), []);

  const onWeightChange = useCallback((s: string) => setWeightText(cleanNumericInput(s, 4)), []);
  const onWeightBlur = useCallback(() => setWeightText((prev) => normalizeNumericText(prev, 4)), []);

  return (
    <div className="min-h-screen p-6 md:p-10 bg-gradient-to-b from-white to-gray-50">
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl md:text-3xl font-semibold">Vet Medication Suite</h1>
            <p className="text-sm text-gray-600">Multi-tab calculator with formulary</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={reset}>
              <RefreshCw className="w-4 h-4 mr-2" />
              Reset
            </Button>
          </div>
        </header>

        {/* Patient row with species, weight, and global search */}
        <Card>
          <CardContent className="grid gap-4 md:grid-cols-12 pt-6 items-end">
            <div className="md:col-span-2">
              <Label>Species</Label>
              <Select value={species} onValueChange={setSpecies as any}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="dog">Dog</SelectItem>
                  <SelectItem value="cat">Cat</SelectItem>
                  <SelectItem value="rabbit">Rabbit</SelectItem>
                  <SelectItem value="gpig">Guinea pig</SelectItem>
                  <SelectItem value="rat">Rat</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="md:col-span-3">
              <Label>Weight</Label>
              <div className="flex gap-2">
                <div className="relative w-full">
                  <Search className="w-4 h-4 absolute left-2 top-1/2 -translate-y-1/2 opacity-0 pointer-events-none" />
                  <Input
                    type="text"
                    inputMode="decimal"
                    value={weightText}
                    onChange={(e) => onWeightChange(e.target.value)}
                    onBlur={onWeightBlur}
                    placeholder={unit === "kg" ? "e.g., 5.2" : "e.g., 12"}
                  />
                </div>
                <Select value={unit} onValueChange={(v) => setUnit(v as any)}>
                  <SelectTrigger className="w-24">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="kg">kg</SelectItem>
                    <SelectItem value="lb">lb</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="md:col-span-5">
              <Label>Search name or category (all tabs)</Label>
              <div className="relative">
                <Search className="w-4 h-4 absolute left-2 top-1/2 -translate-y-1/2" />
                <Input
                  className="pl-7"
                  placeholder="e.g., Cerenia, opioid, epinephrine..."
                  value={globalQuery}
                  onChange={(e) => setGlobalQuery(e.target.value)}
                />
              </div>
            </div>
            <div className="md:col-span-2 flex items-center gap-2">
              <Label className="text-xs">This species only</Label>
              <Switch checked={onlyMySpecies} onCheckedChange={setOnlyMySpecies as any} />
            </div>
          </CardContent>
        </Card>

        <Tabs defaultValue="common" className="w-full">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="common">Solids</TabsTrigger>
            <TabsTrigger value="inject">Injectables</TabsTrigger>
            <TabsTrigger value="anes">Anesthesia</TabsTrigger>
            <TabsTrigger value="selected">Selected</TabsTrigger>
          </TabsList>

        {/* Tabs content */}
          <TabsContent value="common">
            <Formulary
              title="Solids"
              drugs={COMMON_DRUGS}
              species={species}
              weightKg={Number(weightKg)}
              globalQuery={globalQuery}
              onlyMySpecies={onlyMySpecies}
              selected={selected}
              onToggleSelected={toggleSelected}
              onUpdateSelected={updateSelected}
            />
          </TabsContent>

          <TabsContent value="inject">
            <Formulary
              title="Injectable Medications"
              drugs={INJECTABLE_DRUGS}
              species={species}
              weightKg={Number(weightKg)}
              globalQuery={globalQuery}
              onlyMySpecies={onlyMySpecies}
              selected={selected}
              onToggleSelected={toggleSelected}
              onUpdateSelected={updateSelected}
            />
          </TabsContent>

          <TabsContent value="anes">
            <Formulary
              title="Anesthesia Medications"
              drugs={ANES_DRUGS}
              species={species}
              weightKg={Number(weightKg)}
              globalQuery={globalQuery}
              onlyMySpecies={onlyMySpecies}
              selected={selected}
              onToggleSelected={toggleSelected}
              onUpdateSelected={updateSelected}
            />
          </TabsContent>

          <TabsContent value="selected">
            <SelectedTab
              selected={selected}
              patient={{ species, weightKg: Number(weightKg) }}
              onClearAll={clearAllSelected}
              onUpdateSelected={updateSelected}
            />
          </TabsContent>
        </Tabs>

        <Alert>
          <AlertTitle>Clinical judgment required</AlertTitle>
          <AlertDescription>
            These tools perform weight-based math and provide example ranges. Always verify doses and indications
            against your clinic protocols.
          </AlertDescription>
        </Alert>
      </div>
    </div>
  );
}

// -----------------------------
// Formulary Component
// -----------------------------

function Formulary({
  title,
  drugs,
  species,
  weightKg,
  globalQuery,
  onlyMySpecies,
  selected,
  onToggleSelected,
  onUpdateSelected,
}: {
  title: string;
  drugs: Drug[];
  species: Species;
  weightKg: number;
  globalQuery: string;
  onlyMySpecies: boolean;
  selected: Record<string, SelectedItem>;
  onToggleSelected: (i: SelectedItem) => void;
  onUpdateSelected: (i: SelectedItem) => void;
}) {
  const source = globalQuery.trim() ? ALL_DRUGS : drugs;
  const filtered = useMemo(() => {
    const q = globalQuery.trim().toLowerCase();
    return source
      .filter((d) => !onlyMySpecies || d.species.includes(species))
      .filter((d) => (q ? d.name.toLowerCase().includes(q) || d.category.toLowerCase().includes(q) : true));
  }, [source, onlyMySpecies, species, globalQuery]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{globalQuery.trim() ? `Search results (${filtered.length})` : title}</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-3">
        {filtered.map((d) => (
          <DrugRow
            key={d.id}
            drug={d}
            species={species as Exclude<Species, "all">}
            weightKg={weightKg}
            isSelected={!!selected[d.id]}
            onToggleSelected={onToggleSelected}
            onUpdateSelected={onUpdateSelected}
          />
        ))}
        {filtered.length === 0 && <p className="text-sm text-gray-500">No matches.</p>}
      </CardContent>
    </Card>
  );
}

// -----------------------------
// Drug Row (stable effect deps)
// -----------------------------

function DrugRow({
  drug,
  species,
  weightKg,
  isSelected,
  onToggleSelected,
  onUpdateSelected,
}: {
  drug: Drug;
  species: Exclude<Species, "all">;
  weightKg: number;
  isSelected: boolean;
  onToggleSelected: (i: SelectedItem) => void;
  onUpdateSelected: (i: SelectedItem) => void;
}) {
  const range = getActiveRange(drug, species);
  const midDose = range ? (range.min + range.max) / 2 : undefined;

  const [doseInput, setDoseInput] = useState<string>(midDose != null ? String(midDose) : "");

  const hasPresentations = Array.isArray(drug.presentations) && drug.presentations.length > 0;
  const [presentationIndex, setPresentationIndex] = useState<number>(hasPresentations ? 0 : -1);

  // Reset when drug/species changes
  useEffect(() => {
    setDoseInput(midDose != null ? String(midDose) : "");
    setPresentationIndex(hasPresentations ? 0 : -1);
  }, [midDose, hasPresentations, drug.id]);

  const parsedDose: number | undefined = useMemo(() => {
    const raw = (doseInput ?? "").trim();
    if (raw === "") return undefined;
    const normalized = raw.replace(",", ".");
    const n = Number(normalized);
    return Number.isFinite(n) ? n : undefined;
  }, [doseInput]);

  const mg = useMemo(() => (parsedDose == null ? 0 : computeDoseMg(parsedDose, weightKg)), [parsedDose, weightKg]);

  const currentPresentation: Presentation | undefined = useMemo(() => {
    if (!hasPresentations || presentationIndex < 0) return undefined;
    return drug.presentations![presentationIndex];
  }, [hasPresentations, presentationIndex, drug.presentations]);

  const resultText: string = useMemo(() => {
    if (parsedDose == null) return "—";
    if (!currentPresentation) return "—";
    const v = toNum(currentPresentation.value, 0);
    if (v <= 0) return currentPresentation.kind === "liquid" ? "Set conc" : "Set mg/tab";
    const qty = mg / v;
    return `${round(qty, 2)} ${currentPresentation.kind === "liquid" ? "mL" : "tabs"}`;
  }, [parsedDose, currentPresentation, mg]);

  const outOfRange = useMemo(() => {
    if (parsedDose == null || !range) return false;
    return parsedDose < range.min || parsedDose > range.max;
  }, [parsedDose, range]);

  // ✅ Only runs when relevant values change (no update storm)
  useEffect(() => {
    if (!isSelected) return;
    onUpdateSelected({
      id: drug.id,
      name: drug.name,
      category: drug.category,
      route: drug.route,
      unitLabel: drug.unitLabel,
      dose: parsedDose,
      presentation: currentPresentation,
      resultText,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    isSelected,
    drug.id,
    drug.name,
    drug.category,
    drug.route,
    drug.unitLabel,
    parsedDose,
    currentPresentation,
    resultText,
    onUpdateSelected,
  ]);

  const doseLabel = drug.unitLabel || "mg/kg";

  return (
    <div className={`grid gap-3 md:grid-cols-12 items-end border rounded-xl p-3 ${outOfRange ? "border-red-400" : ""}`}>
      <div className="md:col-span-1 flex items-center gap-2">
        <input
          aria-label={`Select ${drug.name}`}
          type="checkbox"
          className="w-4 h-4"
          checked={isSelected}
          onChange={() =>
            onToggleSelected({
              id: drug.id,
              name: drug.name,
              category: drug.category,
              route: drug.route,
              unitLabel: drug.unitLabel,
              dose: parsedDose,
              presentation: currentPresentation,
              resultText,
            })
          }
        />
      </div>
      <div className="md:col-span-3">
        <p className="font-medium">{drug.name}</p>
        <p className="text-xs text-gray-500">{drug.category}</p>
      </div>
      <div className="md:col-span-3">
        <Label>Dose ({doseLabel})</Label>
        <div className="flex gap-2">
          <Input
            type="text"
            inputMode="decimal"
            value={doseInput}
            onChange={(e) => setDoseInput(e.target.value)}
            className={outOfRange ? "border-red-500 focus-visible:ring-gray-400" : ""}
          />
          {range && (
            <div className="text-xs text-gray-500 self-center">
              {range.min}–{range.max} {doseLabel}
            </div>
          )}
        </div>
      </div>
      <div className="md:col-span-3">
        <Label>Presentation</Label>
        {hasPresentations ? (
          <Select value={String(presentationIndex)} onValueChange={(v) => setPresentationIndex(Number(v))}>
            <SelectTrigger className="w-56">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {drug.presentations!.map((p, idx) => (
                <SelectItem key={`${p.label}-${idx}`} value={String(idx)}>
                  {p.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <div className="text-sm text-gray-500 mt-2">No preset presentations</div>
        )}
      </div>
      <div className="md:col-span-1">
        <Label>Route</Label>
        <p>{drug.route ?? "—"}</p>
      </div>
      <div className="md:col-span-1 flex items-end justify-end">
        <div className="text-right">
          <Label>Result</Label>
          <p className={`font-medium ${outOfRange ? "text-red-600" : ""}`}>{resultText}</p>
        </div>
      </div>
      {drug.notes && (
        <div className="md:col-span-12">
          <p className="text-xs text-gray-500">Note: {drug.notes}</p>
        </div>
      )}
    </div>
  );
}

// -----------------------------
// Selected Tab
// -----------------------------

function SelectedTab({
  selected,
  patient,
  onClearAll,
  onUpdateSelected,
}: {
  selected: Record<string, SelectedItem>;
  patient: { species: Species; weightKg: number };
  onClearAll: () => void;
  onUpdateSelected: (i: SelectedItem) => void;
}) {
  const items = Object.values(selected);

  const doPrint = () => {
    const win = typeof window !== "undefined" ? window.open("", "_blank", "width=850,height=1000") : null;
    if (!win) return;
    const rows = items
      .map(
        (it) =>
          `<tr>` +
          `<td style='padding:6px;border:1px solid #ddd'>${it.name}${it.presentation ? ` <span style='color:#666'>(${it.presentation.label})</span>` : ""}</td>` +
          `<td style='padding:6px;border:1px solid #ddd'>${it.category}</td>` +
          `<td style='padding:6px;border:1px solid #ddd'>${it.route || ""}</td>` +
          `<td style='padding:6px;border:1px solid #ddd'>${it.dose ?? ""} ${it.unitLabel || "mg/kg"}</td>` +
          `<td style='padding:6px;border:1px solid #ddd'><b>${it.resultText}</b></td>` +
          `<td style='padding:6px;border:1px solid #ddd'>${(it.notes || "").replace(/</g, "&lt;")}</td>` +
          `</tr>`
      )
      .join("");
    const html = `<!doctype html><html><head><meta charset='utf-8'><title>Selected Meds</title>
      <style>body{font-family:ui-sans-serif,system-ui,Segoe UI,Roboto,Helvetica,Arial,sans-serif;margin:24px} h1{font-size:20px;margin:0 0 12px} table{border-collapse:collapse;width:100%} th{background:#f5f5f5;text-align:left;padding:8px;border:1px solid #ddd}</style>
      </head><body>
      <h1>Selected Meds — ${patient.species} — ${round(patient.weightKg, 2)} kg</h1>
      <table><thead><tr><th>Drug</th><th>Category</th><th>Route</th><th>Dose</th><th>Result</th><th>Notes</th></tr></thead><tbody>${rows}</tbody></table>
      <p style='margin-top:12px;font-size:12px;color:#666'>Generated by Vet Medication Suite. Verify against clinic protocols before administering.</p>
      <script>window.onload=()=>{window.print();}</script>
      </body></html>`;
    win.document.write(html);
    win.document.close();
  };

  return (
    <Card>
      <CardHeader className="flex items-center justify-between">
        <CardTitle className="text-lg">Selected Medications ({items.length})</CardTitle>
        <div className="flex gap-2">
          <Button variant="outline" onClick={onClearAll}>
            Clear all
          </Button>
          <Button variant="outline" onClick={doPrint}>
            <Printer className="w-4 h-4 mr-2" />
            Print sheet
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <p className="text-sm text-gray-500">No meds selected yet. Use the checkboxes on any tab to add items here.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left border-b">
                  <th className="py-2 pr-3">Drug</th>
                  <th className="py-2 pr-3">Category</th>
                  <th className="py-2 pr-3">Route</th>
                  <th className="py-2 pr-3">Dose</th>
                  <th className="py-2 pr-3">Result</th>
                  <th className="py-2 pr-3">Notes</th>
                </tr>
              </thead>
              <tbody>
                {items.map((it) => (
                  <tr key={it.id} className="border-b align-top">
                    <td className="py-2 pr-3 font-medium">
                      {it.name}
                      {it.presentation ? <span className="text-gray-500"> ({it.presentation.label})</span> : null}
                    </td>
                    <td className="py-2 pr-3">{it.category}</td>
                    <td className="py-2 pr-3">{it.route || "—"}</td>
                    <td className="py-2 pr-3">
                      {it.dose ?? "—"} {it.unitLabel || "mg/kg"}
                    </td>
                    <td className="py-2 pr-3 font-semibold">{it.resultText}</td>
                    <td className="py-2 pr-3">
                      <textarea
                        className="w-full border rounded-md p-2 text-sm"
                        placeholder="Directions / timing / cautions..."
                        value={it.notes || ""}
                        onChange={(e) => onUpdateSelected({ ...it, notes: e.target.value })}
                        rows={2}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
