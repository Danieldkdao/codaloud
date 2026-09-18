import "./prepare-local-workspace.mjs";
import { execFileSync } from "node:child_process";
execFileSync("cmake", ["-S", "modules/local-workspace", "-B", "modules/local-workspace/build-host", "-DCODALOUD_NATIVE_TEST_TRANSPORT=ON"], { stdio: "inherit" });
execFileSync("cmake", ["--build", "modules/local-workspace/build-host", "--parallel", "8"], { stdio: "inherit" });
