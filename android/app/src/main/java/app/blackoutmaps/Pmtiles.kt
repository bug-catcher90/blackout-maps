package app.blackoutmaps

import java.io.ByteArrayInputStream
import java.io.File
import java.io.RandomAccessFile
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.util.zip.GZIPInputStream

class Pmtiles(file: File) {
    private val archive = RandomAccessFile(file, "r")
    private val root: List<Entry>
    private val leafOffset: Long
    private val tileOffset: Long
    private val internalCompression: Int
    private val tileCompression: Int
    val minZoom: Int
    val maxZoom: Int
    private val leaves = HashMap<Long, List<Entry>>()
    private val cache = object : LinkedHashMap<Long, ByteArray>(128, 0.75f, true) {
        override fun removeEldestEntry(eldest: MutableMap.MutableEntry<Long, ByteArray>) = size > 128
    }

    init {
        check(tileId(0, 0, 0) == 0L)
        check(tileId(1, 0, 0) == 1L)
        check(tileId(1, 0, 1) == 2L)
        check(tileId(1, 1, 1) == 3L)
        check(tileId(1, 1, 0) == 4L)
        check(tileId(2, 0, 0) == 5L)
        val header = ByteArray(127)
        synchronized(archive) {
            archive.seek(0)
            archive.readFully(header)
        }
        val buffer = ByteBuffer.wrap(header).order(ByteOrder.LITTLE_ENDIAN)
        val magic = ByteArray(7)
        buffer.get(magic)
        require(String(magic, Charsets.US_ASCII) == "PMTiles") { "pmtiles" }
        require(buffer.get().toInt() == 3) { "pmtiles" }
        val rootOffset = buffer.long
        val rootLength = buffer.long
        buffer.long
        buffer.long
        leafOffset = buffer.long
        buffer.long
        tileOffset = buffer.long
        buffer.long
        buffer.long
        buffer.long
        buffer.long
        buffer.get()
        internalCompression = buffer.get().toInt() and 0xff
        tileCompression = buffer.get().toInt() and 0xff
        buffer.get()
        minZoom = buffer.get().toInt() and 0xff
        maxZoom = buffer.get().toInt() and 0xff
        root = directory(readAbsolute(rootOffset, rootLength))
    }

    fun tile(z: Int, x: Int, y: Int): ByteArray? {
        if (z < minZoom || z > maxZoom) return null
        val id = tileId(z, x, y)
        synchronized(this) {
            cache[id]?.let { return if (it.isEmpty()) null else it }
            val bytes = find(root, id)?.let { readTile(it) } ?: ByteArray(0)
            cache[id] = bytes
            return bytes.takeIf { it.isNotEmpty() }
        }
    }

    fun close() {
        synchronized(archive) { archive.close() }
    }

    private fun find(entries: List<Entry>, tileId: Long, depth: Int = 0): Entry? {
        val entry = locate(entries, tileId) ?: return null
        if (entry.runLength != 0L) return entry
        if (depth > 3) return null
        val leaf = leaves.getOrPut(entry.offset) {
            directory(readAbsolute(leafOffset + entry.offset, entry.length))
        }
        return find(leaf, tileId, depth + 1)
    }

    private fun readTile(entry: Entry): ByteArray {
        val raw = readAbsolute(tileOffset + entry.offset, entry.length)
        if (tileCompression == 2 || (tileCompression == 0 && raw.size > 2 && raw[0] == 0x1f.toByte() && raw[1] == 0x8b.toByte())) {
            return gunzip(raw)
        }
        return raw
    }

    private fun directory(raw: ByteArray): List<Entry> {
        val bytes = if (internalCompression == 2) gunzip(raw) else raw
        val cursor = Cursor(bytes)
        val count = cursor.varint().toInt()
        val ids = LongArray(count)
        var last = 0L
        for (index in 0 until count) {
            last += cursor.varint()
            ids[index] = last
        }
        val runs = LongArray(count) { cursor.varint() }
        val lengths = LongArray(count) { cursor.varint() }
        var next = 0L
        return List(count) { index ->
            val encoded = cursor.varint()
            val offset = if (index > 0 && encoded == 0L) next else encoded - 1
            next = offset + lengths[index]
            Entry(ids[index], offset, lengths[index], runs[index])
        }
    }

    private fun readAbsolute(offset: Long, length: Long): ByteArray {
        if (length <= 0 || length > Int.MAX_VALUE) return ByteArray(0)
        val bytes = ByteArray(length.toInt())
        synchronized(archive) {
            archive.seek(offset)
            archive.readFully(bytes)
        }
        return bytes
    }

    private data class Entry(val tileId: Long, val offset: Long, val length: Long, val runLength: Long)

    private class Cursor(val data: ByteArray) {
        var index = 0
        fun varint(): Long {
            var result = 0L
            var shift = 0
            while (index < data.size && shift <= 63) {
                val bite = data[index++].toInt() and 0xff
                result = result or ((bite and 0x7f).toLong() shl shift)
                if (bite and 0x80 == 0) return result
                shift += 7
            }
            error("varint")
        }
    }

    companion object {
        fun tileId(z: Int, x: Int, y: Int): Long {
            if (z == 0) return 0
            val acc = ((1L shl (z * 2)) - 1) / 3
            return acc + hilbert(z, x, y)
        }

        private fun hilbert(z: Int, xIn: Int, yIn: Int): Long {
            var x = xIn
            var y = yIn
            val n = 1 shl z
            var d = 0L
            var s = n shr 1
            while (s > 0) {
                val rx = if (x and s != 0) 1 else 0
                val ry = if (y and s != 0) 1 else 0
                d += s.toLong() * s.toLong() * ((3 * rx) xor ry)
                if (ry == 0) {
                    if (rx == 1) {
                        x = n - 1 - x
                        y = n - 1 - y
                    }
                    val swap = x
                    x = y
                    y = swap
                }
                s = s shr 1
            }
            return d
        }

        private fun locate(entries: List<Entry>, tileId: Long): Entry? {
            var lo = 0
            var hi = entries.lastIndex
            var found = -1
            while (lo <= hi) {
                val mid = (lo + hi) ushr 1
                if (entries[mid].tileId <= tileId) {
                    found = mid
                    lo = mid + 1
                } else {
                    hi = mid - 1
                }
            }
            if (found < 0) return null
            val entry = entries[found]
            if (entry.runLength == 0L || tileId < entry.tileId + entry.runLength) return entry
            return null
        }

        private fun gunzip(bytes: ByteArray) = GZIPInputStream(ByteArrayInputStream(bytes)).use { it.readBytes() }
    }
}
