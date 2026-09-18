// Pure map presentation. The simulation's saved trip times remain authoritative.
import { CITY_GEO, buildPlanRouteGeoJSON } from "./geoData";
import { getTrafficLevel, getSegmentTrafficLevel } from "./trafficSystem";

export const TRAFFIC_COLOR_EXPRESSION = ["match", ["get", "trafficLevel"],
  0, "#4ADE80", 1, "#FBBF24", 2, "#FB923C", 3, "#EF4444", "#4ADE80"];

export function withTraffic(collection, gameTime) {
  return { ...collection, features: (collection?.features || []).map(feature => {
    const p = feature.properties || {};
    if (feature.geometry?.type !== "LineString" || !p.fromCity || !p.toCity) return feature;
    const level = p.segmentIndex !== undefined
      ? getSegmentTrafficLevel(gameTime, p.fromCity, p.toCity, p.segmentIndex, p.segmentCount)
      : getTrafficLevel(gameTime, p.fromCity, p.toCity);
    return { ...feature, properties: { ...p, trafficLevel: level } };
  }) };
}

// A bounded network of neighbouring cities; geometry is cached independently of game time.
const fallbackRoutes = {};
const geometryCache = new WeakMap();
function networkGeometry(routeData) {
  const key = routeData || fallbackRoutes;
  if (geometryCache.has(key)) return geometryCache.get(key);
  const cities = Object.keys(CITY_GEO).sort();
  const edges = new Set();
  const distance = (a, b) => {
    const [x, y] = CITY_GEO[a], [xx, yy] = CITY_GEO[b];
    return ((x - xx) * Math.cos((y + yy) * Math.PI / 360)) ** 2 + (y - yy) ** 2;
  };
  for (const city of cities) {
    const nearest = cities.filter(c => c !== city).sort((a, b) => distance(city, a) - distance(city, b)).slice(0, 3);
    for (const other of nearest) edges.add([city, other].sort().join("->"));
  }
  const features = [];
  for (const edge of [...edges].sort()) {
    let [from, to] = edge.split("->");
    if (!routeData?.routes?.[from + "->" + to] && routeData?.routes?.[to + "->" + from]) [from, to] = [to, from];
    features.push(...buildPlanRouteGeoJSON(from, to, false, null, null, routeData).features);
  }
  const geometry = { type: "FeatureCollection", features };
  geometryCache.set(key, geometry);
  return geometry;
}
export function buildTrafficNetwork(routeData, gameTime) {
  return withTraffic(networkGeometry(routeData), gameTime);
}
export function getRouteTrafficProfile(gameTime, fromCity, toCity, routeData) {
  const collection = withTraffic(buildPlanRouteGeoJSON(fromCity, toCity, false, null, null, routeData), gameTime);
  const levels = collection.features.map(f => f.properties.trafficLevel);
  return { level: levels.length ? Math.max(...levels) : 0, levels };
}
