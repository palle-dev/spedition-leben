// Porträt-Katalog für FERNWERK.
// 12 einheitliche Cartoon-Porträts, die persistent Personen zugeordnet werden.
// Jedes Porträt ist ein hochwertiges, individuelles Cartoon-Brustporträt
// im einheitlichen Stil mit dunklem Hintergrund und Lime-/Korall-Akzenten.

export const PORTRAITS = {
  p01: "https://media.base44.com/images/public/6aa52ebc01a939da57f8b78f/1d7cc5405_generated_image.png",
  p02: "https://media.base44.com/images/public/6aa52ebc01a939da57f8b78f/3816ef93c_generated_image.png",
  p03: "https://media.base44.com/images/public/6aa52ebc01a939da57f8b78f/412bf510e_generated_image.png",
  p04: "https://media.base44.com/images/public/6aa52ebc01a939da57f8b78f/28f3dc4fd_generated_image.png",
  p05: "https://media.base44.com/images/public/6aa52ebc01a939da57f8b78f/184970c5a_generated_image.png",
  p06: "https://media.base44.com/images/public/6aa52ebc01a939da57f8b78f/6d1ea863f_generated_image.png",
  p07: "https://media.base44.com/images/public/6aa52ebc01a939da57f8b78f/bf00a8a40_generated_image.png",
  p08: "https://media.base44.com/images/public/6aa52ebc01a939da57f8b78f/d3eecebb6_generated_image.png",
  p09: "https://media.base44.com/images/public/6aa52ebc01a939da57f8b78f/d92b9d553_generated_image.png",
  p10: "https://media.base44.com/images/public/6aa52ebc01a939da57f8b78f/732eab958_generated_image.png",
  p11: "https://media.base44.com/images/public/6aa52ebc01a939da57f8b78f/bb99ce5f6_generated_image.png",
  p12: "https://media.base44.com/images/public/6aa52ebc01a939da57f8b78f/69c6d5d37_generated_image.png",
};

// Gibt die URL für eine portrait_id zurück. Fallback auf p01.
export function getPortraitUrl(portraitId) {
  return PORTRAITS[portraitId] || PORTRAITS.p01;
}