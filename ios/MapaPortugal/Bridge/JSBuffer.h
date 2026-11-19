#import <Foundation/Foundation.h>
#import <JavaScriptCore/JavaScriptCore.h>

NS_ASSUME_NONNULL_BEGIN

JSValue * _Nullable PTArrayBufferNoCopy(JSContext *context, const void *bytes, size_t length);
int PTGunzipFile(const char *srcPath, const char *dstPath);

NS_ASSUME_NONNULL_END
