#import <Foundation/Foundation.h>

NS_ASSUME_NONNULL_BEGIN
@interface LocalWorkspaceBridge : NSObject
+ (NSString *)execute:(NSString *)root request:(NSString *)request;
@end
NS_ASSUME_NONNULL_END
