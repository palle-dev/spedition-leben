// Fictional game values, not manufacturer specifications or real tariffs.
export const ELECTRIC_MODELS = {
 electric_regional: { id:"electric_regional", label:"E-Regional-Lkw", capacityTons:8, batteryCapacityKWh:180, consumptionKWhPer100km:65, maxChargeKw:150, priceCents:4200000, monthlyRateCents:110000 },
 electric_standard: { id:"electric_standard", label:"E-Standard-Lkw", capacityTons:12, batteryCapacityKWh:320, consumptionKWhPer100km:95, maxChargeKw:250, priceCents:7200000, monthlyRateCents:190000 },
 electric_heavy: { id:"electric_heavy", label:"E-Fernverkehrs-Lkw", capacityTons:24, batteryCapacityKWh:540, consumptionKWhPer100km:125, maxChargeKw:350, priceCents:12000000, monthlyRateCents:310000 },
};
export const ENERGY_RULES = { gridCentsPerKWh:30, publicCentsPerKWh:65, exportCentsPerKWh:8, chargeEfficiency:0.92, storageEfficiency:0.95, reserveFraction:0.10, publicTargetFraction:0.90 };
export const ENERGY_UPGRADES = {
 pv: { label:"PV-Anlage · +50 kWp", priceCents:3500000, field:"pvKwp", amount:50, max:2000 },
 storage: { label:"Gewerbespeicher · +100 kWh / 50 kW", priceCents:3000000, field:"storageKWh", amount:100, max:5000 },
 wallbox: { label:"Wallbox · 22 kW", priceCents:250000, field:"wallboxes", amount:1, max:100 },
 dc: { label:"DC-Ladepunkt · 150 kW", priceCents:4500000, field:"dcChargers", amount:1, max:100 },
 grid: { label:"Netzanschluss · +150 kW", priceCents:1500000, field:"gridKw", amount:150, max:3000 },
};
export function electricFields(profile, body={consumptionAdd:0}) {
 if (profile?.powertrain !== "electric") return {};
 return { powertrain:"electric", batteryCapacityKWh:profile.batteryCapacityKWh, batteryKWh:profile.batteryCapacityKWh,
 consumptionKWhPer100km:profile.consumptionKWhPer100km + (body.consumptionAdd || 0)*2,
 maxChargeKw:profile.maxChargeKw, maxAcChargeKw:22, consumptionPer100km:0 };
}
