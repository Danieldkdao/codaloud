import { requireNativeModule } from "expo";

export default requireNativeModule<{ execute: (request: string) => Promise<string> }>("LocalWorkspace");
