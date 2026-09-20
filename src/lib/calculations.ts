// Automatic calculations spec:
//   Total Waste      = Plate + Counter + Packaging
//   Waste per Person  = Total Waste ÷ Headcount
//   Waste %           = (Total Waste ÷ Quantity Prepared) × 100
//
// These are always server-computed on create/update — never trust a
// client-supplied value for these fields, even if present in the request body.

export interface WasteInputs {
  plateWasteKg: number;
  counterWasteKg: number;
  packagingWasteKg: number;
  headcount: number;
  quantityPrepared: number;
}

export interface WasteDerived {
  totalWasteKg: number;
  wastePerPerson: number;
  wastePercent: number;
}

export function computeWasteDerivedFields(input: WasteInputs): WasteDerived {
  const totalWasteKg = round2(input.plateWasteKg + input.counterWasteKg + input.packagingWasteKg);

  const wastePerPerson = input.headcount > 0 ? round2(totalWasteKg / input.headcount) : 0;

  const wastePercent =
    input.quantityPrepared > 0 ? round2((totalWasteKg / input.quantityPrepared) * 100) : 0;

  return { totalWasteKg, wastePerPerson, wastePercent };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
