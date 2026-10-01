import ExpoModulesCore
import Foundation

public class LocalWorkspaceModule: Module {
  // Project mutexes serialize mutations; scans must not block other Expo modules.
  private let workspaceQueue = DispatchQueue(label: "codaloud.workspace", qos: .userInitiated, attributes: .concurrent)

  public func definition() -> ModuleDefinition {
    Name("LocalWorkspace")

    AsyncFunction("execute") { (request: String) -> String in
      let documents = try FileManager.default.url(for: .documentDirectory, in: .userDomainMask, appropriateFor: nil, create: true)
      let root = documents.appendingPathComponent("codaloud-workspaces", isDirectory: true)
      try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
      return LocalWorkspaceBridge.execute(root.path, request: request)
    }.runOnQueue(workspaceQueue)
  }
}
