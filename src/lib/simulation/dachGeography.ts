const DE_COORDS = {
  Hamburg: [9.9937, 53.5511], Bremen: [8.8072, 53.0758], Kiel: [10.1394, 54.3233],
  Lübeck: [10.6866, 53.8697], Hannover: [9.7322, 52.3759], Berlin: [13.4050, 52.5200],
  Rostock: [12.0989, 54.0922], Magdeburg: [11.6276, 52.1205],
  München: [11.5820, 48.1351], Köln: [6.9603, 50.9375], Düsseldorf: [6.7760, 51.2217],
  Frankfurt: [8.6821, 50.1109], Stuttgart: [9.1829, 48.7758], Leipzig: [12.3878, 51.3438],
  Dresden: [13.7373, 51.0504], Nürnberg: [11.0775, 49.4539], Dortmund: [7.4653, 51.5136],
  Essen: [7.0127, 51.4556], Mannheim: [8.4914, 49.4891], Freiburg: [7.8491, 47.9990],
  Braunschweig: [10.5276, 52.2688], Erfurt: [11.0290, 50.9847], Kassel: [9.4797, 51.3128],
  Münster: [7.6261, 51.9607], Osnabrück: [8.0472, 52.2790], Saarbrücken: [7.0019, 49.2354],
  Regensburg: [12.1016, 49.0175], Würzburg: [9.9296, 49.7924], Bielefeld: [8.5285, 52.0302],
  Ulm: [9.9900, 48.4011]
};
// Representative logistics locations cover all 16 German states, 9 Austrian states and 26 Swiss cantons.
export const EXTRA_LOCATIONS: [string,string,string,number,number][] = [
 ["Schwerin","DE","MV",11.407,53.629],["Potsdam","DE","BB",13.065,52.391],["Mainz","DE","RP",8.247,49.992],["Wiesbaden","DE","HE",8.239,50.083],
 ["Wien","AT","W",16.374,48.208],["Graz","AT","ST",15.439,47.071],["Linz","AT","OO",14.286,48.306],["Salzburg","AT","SA",13.055,47.809],["Innsbruck","AT","TI",11.404,47.269],["Klagenfurt","AT","KA",14.306,46.624],["St. Pölten","AT","NO",15.625,48.204],["Eisenstadt","AT","BU",16.528,47.846],["Bregenz","AT","VO",9.747,47.503],["Wels","AT","OO",14.026,48.166],["Villach","AT","KA",13.85,46.61],
 ["Zürich","CH","ZH",8.542,47.377],["Bern","CH","BE",7.447,46.948],["Luzern","CH","LU",8.31,47.051],["Altdorf","CH","UR",8.644,46.881],["Schwyz","CH","SZ",8.653,47.021],["Sarnen","CH","OW",8.246,46.897],["Stans","CH","NW",8.365,46.958],["Glarus","CH","GL",9.067,47.04],["Zug","CH","ZG",8.517,47.166],["Fribourg","CH","FR",7.162,46.806],["Solothurn","CH","SO",7.537,47.208],["Basel","CH","BS",7.588,47.56],["Liestal","CH","BL",7.735,47.485],["Schaffhausen","CH","SH",8.635,47.696],["Herisau","CH","AR",9.278,47.386],["Appenzell","CH","AI",9.409,47.331],["St. Gallen","CH","SG",9.377,47.425],["Chur","CH","GR",9.532,46.851],["Aarau","CH","AG",8.046,47.393],["Frauenfeld","CH","TG",8.899,47.557],["Bellinzona","CH","TI",9.023,46.195],["Lausanne","CH","VD",6.632,46.52],["Sion","CH","VS",7.36,46.233],["Neuchâtel","CH","NE",6.931,46.99],["Genf","CH","GE",6.143,46.204],["Delémont","CH","JU",7.345,47.365],["Lugano","CH","TI",8.952,46.004],["Winterthur","CH","ZH",8.724,47.5],
];
export const CITY_LATLON = {...DE_COORDS,...Object.fromEntries(EXTRA_LOCATIONS.map(([name,c,r,lng,lat])=>[name,[lng,lat]]))};
export const CITIES=Object.keys(CITY_LATLON);
export const COUNTRY_NAMES={DE:"Deutschland",AT:"Österreich",CH:"Schweiz"};
export const CITY_COUNTRY={...Object.fromEntries(Object.keys(DE_COORDS).map(c=>[c,"DE"])),...Object.fromEntries(EXTRA_LOCATIONS.map(x=>[x[0],x[1]]))};
export function countryOf(city){return CITY_COUNTRY[city]||null;}
const borders=[
 {id:"Walserberg",countries:["DE","AT"],point:[12.949,47.774]},
 {id:"Kiefersfelden",countries:["DE","AT"],point:[12.188,47.61]},
 {id:"Suben",countries:["DE","AT"],point:[13.435,48.412]},
 {id:"Hörbranz",countries:["DE","AT"],point:[9.747,47.553]},
 {id:"Basel-Weil",countries:["DE","CH"],point:[7.607,47.597]},
 {id:"Thayngen",countries:["DE","CH"],point:[8.713,47.75]},
 {id:"Kreuzlingen",countries:["DE","CH"],point:[9.169,47.658]},
 {id:"St. Margrethen",countries:["AT","CH"],point:[9.64,47.449]},
];
function roadKm(a,b,factor=1.2){const rad=Math.PI/180,dLat=(b[1]-a[1])*rad,dLng=(b[0]-a[0])*rad;return Math.max(0,Math.round(6371*2*Math.asin(Math.min(1,Math.sqrt(Math.sin(dLat/2)**2+Math.cos(a[1]*rad)*Math.cos(b[1]*rad)*Math.sin(dLng/2)**2)))*factor/5)*5);}
const cache=new Map();
export function dachRoute(from,to){
 const key=from+"→"+to;if(cache.has(key))return cache.get(key);
 const a=CITY_LATLON[from],b=CITY_LATLON[to],origin=countryOf(from),destination=countryOf(to);
 if(!a||!b)throw new Error("Unbekannter Routenort: "+from+" → "+to);
 const crossing=origin!==destination?borders.filter(g=>g.countries.includes(origin)&&g.countries.includes(destination)).map(g=>({...g,distance:roadKm(a,g.point)+roadKm(g.point,b)})).sort((x,y)=>x.distance-y.distance||x.id.localeCompare(y.id))[0]:null;
 const segments=crossing?[{country:origin,distanceKm:roadKm(a,crossing.point),fromCity:from,toCity:crossing.id},{country:destination,distanceKm:roadKm(crossing.point,b),fromCity:crossing.id,toCity:to}]:[{country:origin,distanceKm:from===to?0:Math.max(5,roadKm(a,b,origin==="DE"?1.2:1.3)),fromCity:from,toCity:to}];
 const route={fromCity:from,toCity:to,segments,totalKm:segments.reduce((n,s)=>n+s.distanceKm,0),crossing:crossing?{id:crossing.id,from:origin,to:destination,customs:origin==="CH"||destination==="CH"}:null,coordinates:crossing?[a,crossing.point,b]:[a,b],approximate:true};
 cache.set(key,route);return route;
}
export function getDistance(a,b){if(!CITY_LATLON[a]||!CITY_LATLON[b])return 0;return dachRoute(a,b).totalKm;}
export const DACH_CUSTOMERS=EXTRA_LOCATIONS.filter(x=>x[1]!=="DE").map(([city,country],i)=>({id:"dach_customer_"+i,name:city+" Industrie & Handel",industry:"Industrie",contact:"Transportleitung",depots:[city],preferredRelations:[[city,country==="CH"?"Stuttgart":"München"]],cargoTypes:["Stückgut","Maschinenteile","Verpackungsmaterial"]}));
