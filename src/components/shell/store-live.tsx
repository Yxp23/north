"use client";
// Whether prices on screen come live from Channel3 right now (false with STORE_MODE=demo or no Channel3 key). Set by the shell from /api/summary,
// so a screen only says "Live prices from Channel3" when it is true.
import { createContext, useContext } from "react";

export const StoreLiveContext = createContext<boolean>(false);
export const useStoreLive = () => useContext(StoreLiveContext);
