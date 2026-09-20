import { createContext, useContext, useState, type Dispatch, type ReactNode, type SetStateAction } from "react";
import type { EditorCommand } from "./types";

type EditorControls = { canUndo: boolean; canRedo: boolean; run: (command: EditorCommand) => void };
const Context = createContext<{ state: EditorControls | null; setState: Dispatch<SetStateAction<EditorControls | null>> } | null>(null);
export const EditorControlsProvider = ({ children }: { children?: ReactNode }) => {
  const [state, setState] = useState<EditorControls | null>(null);
  return <Context value={{ state, setState }}>{children}</Context>;
};
export const useEditorControls = () => useContext(Context);
