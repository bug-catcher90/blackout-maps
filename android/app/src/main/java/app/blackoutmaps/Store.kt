package app.blackoutmaps

import android.content.Context
import android.content.res.AssetManager
import android.util.Log
import org.json.JSONObject
import java.io.File
import java.io.FileOutputStream
import java.io.InputStream
import java.io.SequenceInputStream
import java.net.HttpURLConnection
import java.net.URL
import java.security.MessageDigest
import java.util.Collections
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
        copyAsset(assets, "base/world.pmtiles", File(base, "world.pmtiles"))
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

    fun present(pack: RemotePack, dest: File): Boolean {
        if (pack.bytes != null && dest.length() != pack.bytes) return false
        if (pack.bytes == null && dest.length() <= 0) return false
        val sha = pack.sha256 ?: return true
        val mark = checksumFile(dest)
        if (mark.exists()) return mark.readText().trim() == sha
        if (sha256(dest) != sha) return false
        mark.writeText(sha)
        return true
    }

    private fun checksumFile(dest: File) = File(dest.parentFile, dest.name + ".sha256")

    private fun sha256(file: File): String {
        val digest = MessageDigest.getInstance("SHA-256")
        file.inputStream().use { input ->
            val buffer = ByteArray(1 shl 20)
            while (true) {
                val read = input.read(buffer)
                if (read < 0) break
                digest.update(buffer, 0, read)
            }
        }
        return digest.digest().joinToString("") { "%02x".format(it) }
    }

    // Split files (docs/country-maps.md): each part is resumed with a Range
    // request and checked against its SHA-256, then the parts are joined and
    // unpacked into dest, and the whole file is checked too.
    private fun fetchParts(pack: RemotePack, dest: File, onProgress: (Long, Long) -> Unit) {
        val dir = dest.parentFile ?: error("dir")
        dir.mkdirs()
        val total = pack.parts.sumOf { it.bytes }
        var before = 0L
        val files = pack.parts.mapIndexed { index, part ->
            val file = File(dir, "${dest.name}.%03d.part".format(index))
            val verified = File(dir, file.name + ".ok")
            if (!(file.length() == part.bytes && verified.exists() && verified.readText() == part.sha256)) {
                verified.delete()
                if (file.length() > part.bytes) file.delete()
                if (file.length() == part.bytes && sha256(file) != part.sha256) file.delete()
                if (file.length() < part.bytes) download(part.url, file) { got -> onProgress(before + got, total) }
                if (file.length() != part.bytes || sha256(file) != part.sha256) {
                    file.delete()
                    error("checksum")
                }
                verified.writeText(part.sha256)
            }
            before += part.bytes
            onProgress(before, total)
            file
        }
        val tmp = File(dir, dest.name + ".tmp")
        val joined: InputStream = SequenceInputStream(Collections.enumeration(files.map { it.inputStream().buffered(1 shl 20) }))
        joined.use { raw ->
            val input = if (pack.gzip) GZIPInputStream(raw, 1 shl 16) else raw
            tmp.outputStream().use { input.copyTo(it, 1 shl 20) }
        }
        if ((pack.bytes != null && tmp.length() != pack.bytes) || (pack.sha256 != null && sha256(tmp) != pack.sha256)) {
            tmp.delete()
            error("checksum")
        }
        replace(tmp, dest)
        pack.sha256?.let { checksumFile(dest).writeText(it) }
        files.forEach { file ->
            File(dir, file.name + ".ok").delete()
            file.delete()
        }
    }

    private fun download(url: String, file: File, onBytes: (Long) -> Unit) {
        val offset = file.length()
        val connection = (URL(url).openConnection() as HttpURLConnection).apply {
            instanceFollowRedirects = true
            connectTimeout = 20_000
            readTimeout = 180_000
            setRequestProperty("User-Agent", "BlackoutMaps/1.1")
            setRequestProperty("Accept", "*/*")
            if (offset > 0) setRequestProperty("Range", "bytes=$offset-")
        }
        try {
            val code = connection.responseCode
            if (code !in 200..299) error("http")
            val append = offset > 0 && code == 206
            var got = if (append) offset else 0L
            connection.inputStream.use { input ->
                FileOutputStream(file, append).use { output ->
                    val buffer = ByteArray(1 shl 16)
                    while (true) {
                        val read = input.read(buffer)
                        if (read < 0) break
                        output.write(buffer, 0, read)
                        got += read
                        onBytes(got)
                    }
                }
            }
        } finally {
            connection.disconnect()
        }
    }

    fun fetch(pack: RemotePack, dest: File, onProgress: (Long, Long) -> Unit = { _, _ -> }) {
        if (pack.parts.isNotEmpty()) {
            if (present(pack, dest)) return
            fetchParts(pack, dest, onProgress)
            return
        }
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
    // The packages live in bug-catcher90/blackout-maps-data. index.json lists them
    // all; the contents API is the fallback when the index cannot be read.
    private const val INDEX = "https://raw.githubusercontent.com/bug-catcher90/blackout-maps-data/main/catalog/index.json"
    private const val INDEX_FORMAT = 1
    private const val CONTENTS = "https://api.github.com/repos/bug-catcher90/blackout-maps-data/contents/catalog"

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
        try {
            val index = JSONObject(get(INDEX))
            val list = index.optJSONArray("packages")
            if (index.optInt("format") == INDEX_FORMAT && list != null) {
                return (0 until list.length())
                    .mapNotNull { list.optJSONObject(it)?.let { entry -> parse(entry.toString()) } }
                    .sortedBy { it.name }
            }
        } catch (_: Exception) {
        }
        val body = get(CONTENTS)
        val entries = org.json.JSONArray(body)
        val packages = mutableListOf<MapPackage>()
        for (index in 0 until entries.length()) {
            val entry = entries.optJSONObject(index) ?: continue
            if (entry.optString("type") != "file" || !entry.optString("name").endsWith(".json") || entry.optString("name") == "index.json") continue
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
            val files = objectJson.optJSONArray("assets") ?: objectJson.optJSONArray("files")
            val packs = buildList {
                if (files != null) {
                    for (index in 0 until files.length()) {
                        val row = files.optJSONObject(index) ?: continue
                        val bytes = if (row.isNull("bytes")) null else row.optLong("bytes").takeIf { it > 0 }
                        val parts = buildList {
                            val list = row.optJSONArray("parts")
                            if (list != null) {
                                for (part in 0 until list.length()) {
                                    val item = list.optJSONObject(part) ?: continue
                                    add(RemotePart(item.optString("url"), item.optLong("bytes"), item.optString("sha256")))
                                }
                            }
                        }
                        val sha = row.optString("sha256").takeIf { it.length == 64 }
                        add(RemotePack(row.optString("key"), row.optString("url"), row.optString("file"), row.optBoolean("gzip"), bytes, row.optString("label"), sha, parts))
                    }
                }
            }
            val keys = packs.map { it.key }.toSet()
            if (!keys.contains("water") || !keys.contains("addresses")) null
            else {
                val view = objectJson.optJSONArray("view")?.let { list -> (0 until list.length()).map { list.optDouble(it) } }?.takeIf { it.size == 3 && it.all { v -> v.isFinite() } }
                MapPackage(id, name, flag, objectJson.optBoolean("autoload"), packs, objectJson.optString("country").ifEmpty { null }, view)
            }
        }
    } catch (_: Exception) {
        null
    }

    private fun json(pkg: MapPackage): String {
        val files = org.json.JSONArray()
        pkg.files.forEach { pack ->
            val parts = org.json.JSONArray()
            pack.parts.forEach { part ->
                parts.put(JSONObject().put("url", part.url).put("bytes", part.bytes).put("sha256", part.sha256))
            }
            files.put(
                JSONObject()
                    .put("key", pack.key)
                    .put("url", pack.url)
                    .put("file", pack.file)
                    .put("gzip", pack.gzip)
                    .put("bytes", pack.bytes ?: JSONObject.NULL)
                    .put("label", pack.label)
                    .put("sha256", pack.sha256 ?: JSONObject.NULL)
                    .put("parts", parts)
            )
        }
        return JSONObject()
            .put("id", pkg.id)
            .put("name", pkg.name)
            .put("flag", pkg.flag)
            .put("autoload", pkg.autoload)
            .put("assets", files)
            .apply {
                pkg.country?.let { put("country", it) }
                pkg.view?.let { put("view", org.json.JSONArray(it)) }
            }
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
