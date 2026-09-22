import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { buildTrafficNetwork, withTraffic, getRouteTrafficProfile } from "@/lib/trafficMapData";
import { CITY_GEO, buildPlanRouteGeoJSON } from "@/lib/geoData";
import MapLegend from "@/components/dispatch/MapLegend";

const routeData = { routes: { "Hamburg->Bremen": { coordinates: Array.from({ length: 30 }, (_, i) => [9.99 - i * 0.04, 53.55 - i * 0.02]) } } };
describe("Verkehrsdarstellung", () => {
  it("zeigt ein begrenztes Netz auch ohne aktive Touren oder Straßengeometrien", () => {
    const data = buildTrafficNetwork(null, 480);
    expect(data.features.length).toBeGreaterThan(25);
    expect(data.features.length).toBeLessThanOrEqual(Object.keys(CITY_GEO).length * 3);
    for (const feature of data.features) {
      expect(feature.geometry.coordinates.length).toBeGreaterThanOrEqual(2);
      expect(feature.properties.trafficLevel).toBeGreaterThanOrEqual(0);
      expect(feature.properties.trafficLevel).toBeLessThanOrEqual(3);
      expect(feature.properties.fallback).toBe(true);
    }
  });
  it("bleibt innerhalb einer Stunde stabil, wechselt stündlich und ist reproduzierbar", () => {
    expect(buildTrafficNetwork(routeData, 480)).toEqual(buildTrafficNetwork(routeData, 539));
    expect(buildTrafficNetwork(routeData, 480)).not.toEqual(buildTrafficNetwork(routeData, 600));
    expect(buildTrafficNetwork(routeData, 480)).toEqual(buildTrafficNetwork(JSON.parse(JSON.stringify(routeData)), 480));
  });
  it("färbt Kartenabschnitte und Detailanzeige konsistent ohne Mutation", () => {
    const plan = buildPlanRouteGeoJSON("Hamburg", "Bremen", false, null, null, routeData);
    const before = structuredClone(plan), originalRoutes = structuredClone(routeData);
    const colored = withTraffic(plan, 480);
    const profile = getRouteTrafficProfile(480, "Hamburg", "Bremen", routeData);
    expect(colored.features).toHaveLength(6);
    expect(profile.levels).toEqual(colored.features.map(f => f.properties.trafficLevel));
    expect(profile.level).toBe(Math.max(...profile.levels));
    expect(plan).toEqual(before);
    expect(routeData).toEqual(originalRoutes);
  });
  it("hält Beschriftungen und Punkte unverändert", () => {
    const point = { type: "Feature", geometry: { type: "Point", coordinates: [10, 53] }, properties: { stopIndex: 1 } };
    expect(withTraffic({ type: "FeatureCollection", features: [point] }, 480).features[0]).toEqual(point);
  });
  it("zeigt die Legende und ihren Zeitstand auch eingeklappt", () => {
    const html = renderToStaticMarkup(React.createElement(MapLegend, { showTraffic: true, gameTime: 515 }));
    for (const label of ["Simulierte Verkehrslage", "Frei", "Leicht", "Dicht", "Stau", "T1 08:00"]) expect(html).toContain(label);
    expect(html).not.toContain("+70%");
    const hidden = renderToStaticMarkup(React.createElement(MapLegend, { showTraffic: false }));
    expect(hidden).toContain("Kartenlegende");
    expect(hidden).not.toContain("Simulierte Verkehrslage");
  });
});
