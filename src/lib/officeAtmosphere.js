export function officeAtmosphere(gameTime = 480) {
 const hour = ((gameTime % 1440) + 1440) % 1440 / 60;
 if (hour < 6 || hour >= 22) return { label: "Nachtschicht", color: "rgba(20,35,90,.26)" };
 if (hour < 10) return { label: "Guten Morgen, Leitstelle", color: "rgba(255,183,94,.09)" };
 if (hour >= 18) return { label: "Abend in der Leitstelle", color: "rgba(210,95,50,.14)" };
 return { label: "Dein Betrieb ist in Bewegung", color: "rgba(110,180,210,.04)" };
}
