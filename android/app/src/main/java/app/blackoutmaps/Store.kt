package app.blackoutmaps

import android.content.Context
import android.content.res.AssetManager
import android.util.Log
import org.json.JSONObject
import java.io.File
import java.net.HttpURLConnection
import java.net.URL
import java.util.zip.GZIPInputStream

object Store {
    fun root(context: Context) = File(context.filesDir, "blackout-maps").also { it.mkdirs() }

    fun directory(context: Context, packageId: String) = File(root(context), packageId).also { it.mkdirs() }

    fun file(context: Context, packageId: String, name: String) = File(directory(context, packageId), name)

    fun manifests(context: Context) = File(root(context), "manifests").also { it.mkdirs() }

    fun copyAsset(assets: AssetManager, name: String, dest: File) {
        dest.parentFile?.mkdirs()
        val expected = runCatching { assets.openFd(name).use { it.length } }.getOrDefault(-1L)
        if (expected > 0 && dest.length() == expected) return
        val tmp = File(dest.parentFile, dest.name + ".part")
        assets.open(name).use { input -> tmp.outputStream().use { input.copyTo(it, 1 shl 20) } }
        if (expected > 0 && tmp.length() != expected) {
            tmp.delete()
            error("short")
        }
        replace(tmp, dest)
    }

    fun inflateAsset(assets: AssetManager, name: String, dest: File, bytes: Long) {
        if (dest.length() == bytes) return
        dest.parentFile?.mkdirs()
        val tmp = File(dest.parentFile, dest.name + ".part")
        assets.open(name).use { raw ->
            GZIPInputStream(raw).use { input -> tmp.outputStream().use { input.copyTo(it, 1 shl 20) } }
        }
        if (tmp.length() != bytes) {
            tmp.delete()
            error("short")
        }
        replace(tmp, dest)
    }

    fun prepare(context: Context, assets: AssetManager): File {
        val base = directory(context, "base")
        copyAsset(assets, "base/portugal.pmtiles", File(base, "portugal.pmtiles"))
        // aapt unpacks a .gz asset and drops the extension, so the APK may already hold the raw file.
        copyOrInflate(assets, "base/roads.bin", "base/roads.bin.gz", File(base, "roads.bin"), 170_238_576)
        copyOrInflate(assets, "base/buildings.bin", "base/buildings.bin.gz", File(base, "buildings.bin"), 79_915_812)
        return base
    }

    private fun copyOrInflate(assets: AssetManager, plain: String, gzip: String, dest: File, bytes: Long) {
        if (dest.length() == bytes) return
        if (assetExists(assets, plain)) {
            copyAsset(assets, plain, dest)
            if (dest.length() == bytes) return
            dest.delete()
        }
        inflateAsset(assets, gzip, dest, bytes)
    }

    private fun assetExists(assets: AssetManager, name: String) = try {
        assets.open(name).close()
        true
    } catch (_: Exception) {
        false
    }

    fun fetch(pack: RemotePack, dest: File) {
        if (pack.bytes != null && dest.length() == pack.bytes) return
        if (pack.bytes == null && dest.length() > 0) return
        dest.parentFile?.mkdirs()
        val downloaded = File(dest.parentFile, dest.name + ".download")
        http(pack.url, downloaded)
        if (!pack.gzip) {
            if (pack.bytes != null && downloaded.length() != pack.bytes) {
                downloaded.delete()
                error("short")
            }
            replace(downloaded, dest)
            return
        }
        val tmp = File(dest.parentFile, dest.name + ".part")
        GZIPInputStream(downloaded.inputStream()).use { input ->
            tmp.outputStream().use { input.copyTo(it, 1 shl 20) }
        }
        downloaded.delete()
        if (pack.bytes != null && tmp.length() != pack.bytes) {
            tmp.delete()
            error("short")
        }
        if (tmp.length() == 0L) {
            tmp.delete()
            error("short")
        }
        replace(tmp, dest)
    }

    private fun http(url: String, dest: File) {
        val connection = (URL(url).openConnection() as HttpURLConnection).apply {
            instanceFollowRedirects = true
            connectTimeout = 20_000
            readTimeout = 180_000
            setRequestProperty("User-Agent", "BlackoutMaps/1.0")
            setRequestProperty("Accept", "*/*")
        }
        try {
            val code = connection.responseCode
            if (code !in 200..299) error("http")
            connection.inputStream.use { input -> dest.outputStream().use { input.copyTo(it, 1 shl 20) } }
        } finally {
            connection.disconnect()
        }
    }

    private fun replace(tmp: File, dest: File) {
        if (dest.exists() && !dest.delete()) Log.w("BlackoutMaps", "replace ${dest.name}")
        if (!tmp.renameTo(dest)) {
            tmp.copyTo(dest, overwrite = true)
            tmp.delete()
        }
    }
}

object Catalog {
    private const val CONTENTS = "https://api.github.com/repos/bug-catcher90/blackout-maps/contents/catalog"

    fun load(context: Context, assets: AssetManager): List<MapPackage> {
        val byId = linkedMapOf<String, MapPackage>()
        assets.list("catalog").orEmpty().filter { it.endsWith(".json") }.forEach { name ->
            parse(assets.open("catalog/$name").bufferedReader().use { it.readText() })?.let { byId[it.id] = it }
        }
        Store.manifests(context).listFiles { file -> file.extension == "json" }.orEmpty().forEach { file ->
            parse(file.readText())?.let { byId[it.id] = it }
        }
        return byId.values.sortedBy { it.name }
    }

    fun remember(context: Context, pkg: MapPackage) {
        Store.manifests(context).also { it.mkdirs() }
        File(Store.manifests(context), "${pkg.id}.json").writeText(json(pkg))
    }

    fun remote(): List<MapPackage> {
        val body = get(CONTENTS)
        val entries = org.json.JSONArray(body)
        val packages = mutableListOf<MapPackage>()
        for (index in 0 until entries.length()) {
            val entry = entries.optJSONObject(index) ?: continue
            if (entry.optString("type") != "file" || !entry.optString("name").endsWith(".json")) continue
            val url = entry.optString("download_url")
            if (url.isEmpty()) continue
            parse(get(url))?.let { packages.add(it) }
        }
        return packages.sortedBy { it.name }
    }

    fun parse(text: String): MapPackage? = try {
        val objectJson = JSONObject(text)
        val id = objectJson.optString("id")
        val name = objectJson.optString("name")
        val flag = objectJson.optString("flag")
        if (id.isEmpty() || name.isEmpty() || flag.isEmpty()) null
        else {
            val files = objectJson.optJSONArray("files")
            val packs = buildList {
                if (files != null) {
                    for (index in 0 until files.length()) {
                        val row = files.optJSONObject(index) ?: continue
                        val bytes = if (row.isNull("bytes")) null else row.optLong("bytes").takeIf { it > 0 }
                        add(RemotePack(row.optString("key"), row.optString("url"), row.optString("file"), row.optBoolean("gzip"), bytes, row.optString("label")))
                    }
                }
            }
            MapPackage(id, name, flag, objectJson.optBoolean("autoload"), packs)
        }
    } catch (_: Exception) {
        null
    }

    private fun json(pkg: MapPackage): String {
        val files = org.json.JSONArray()
        pkg.files.forEach { pack ->
            files.put(
                JSONObject()
                    .put("key", pack.key)
                    .put("url", pack.url)
                    .put("file", pack.file)
                    .put("gzip", pack.gzip)
                    .put("bytes", pack.bytes ?: JSONObject.NULL)
                    .put("label", pack.label)
            )
        }
        return JSONObject()
            .put("id", pkg.id)
            .put("name", pkg.name)
            .put("flag", pkg.flag)
            .put("autoload", pkg.autoload)
            .put("files", files)
            .toString()
    }

    private fun get(url: String): String {
        val connection = (URL(url).openConnection() as HttpURLConnection).apply {
            instanceFollowRedirects = true
            connectTimeout = 20_000
            readTimeout = 60_000
            setRequestProperty("User-Agent", "BlackoutMaps/1.0")
            setRequestProperty("Accept", "application/vnd.github+json")
        }
        try {
            if (connection.responseCode !in 200..299) error("catalog")
            return connection.inputStream.bufferedReader().use { it.readText() }
        } finally {
            connection.disconnect()
        }
    }
}
