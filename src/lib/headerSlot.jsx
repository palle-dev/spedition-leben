import React, { createContext, useContext, useState, useCallback } from "react";

// Erlaubt Seiten, Steuerelemente in den globalen ShellHeader zu injizieren.
// Die Seite ruft setSlot(<JSX/>) auf; ShellHeader rendert den Inhalt.
const HeaderSlotContext = createContext(null);

export const useHeaderSlot = () => useContext(HeaderSlotContext);

export function HeaderSlotProvider({ children }) {
  const [slot, setSlot] = useState(null);
  const clear = useCallback(() => setSlot(null), []);
  return (
    <HeaderSlotContext.Provider value={{ slot, setSlot, clear }}>
      {children}
    </HeaderSlotContext.Provider>
  );
}