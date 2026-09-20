#import "local-workspace-bridge.h"
#include "../cpp/workspace-entry.hpp"

@implementation LocalWorkspaceBridge
+ (NSString *)execute:(NSString *)root request:(NSString *)request {
  const auto result = codaloud::execute(root.UTF8String, request.UTF8String);
  return [[NSString alloc] initWithBytes:result.data() length:result.size() encoding:NSUTF8StringEncoding];
}
@end
