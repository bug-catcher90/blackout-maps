#import "JSBuffer.h"
#import <zlib.h>

JSValue *PTArrayBufferNoCopy(JSContext *context, const void *bytes, size_t length) {
    if (!context || !bytes || length == 0) return nil;
    JSValueRef exception = NULL;
    JSObjectRef object = JSObjectMakeArrayBufferWithBytesNoCopy(context.JSGlobalContextRef, (void *)bytes, length, NULL, NULL, &exception);
    if (!object || exception) return nil;
    return [JSValue valueWithJSValueRef:object inContext:context];
}

int PTGunzipFile(const char *srcPath, const char *dstPath) {
    gzFile in = gzopen(srcPath, "rb");
    if (!in) return 1;
    FILE *out = fopen(dstPath, "wb");
    if (!out) {
        gzclose(in);
        return 2;
    }
    char buffer[65536];
    int read = 0;
    while ((read = gzread(in, buffer, sizeof buffer)) > 0) {
        if (fwrite(buffer, 1, (size_t)read, out) != (size_t)read) {
            fclose(out);
            gzclose(in);
            return 3;
        }
    }
    fclose(out);
    int err = 0;
    gzerror(in, &err);
    gzclose(in);
    return read < 0 || err != Z_OK ? 4 : 0;
}
