package app.blackoutmaps

import android.content.res.AssetManager
import java.net.InetAddress
import java.net.ServerSocket
import java.net.Socket
import java.net.URLDecoder
import java.util.concurrent.Executors

class TileServer(@Volatile private var archive: Pmtiles, private val world: Pmtiles, private val assets: AssetManager) {
    private val socket = ServerSocket()
    private val pool = Executors.newFixedThreadPool(4)
    val port: Int

    init {
        socket.bind(java.net.InetSocketAddress(InetAddress.getByName("127.0.0.1"), 0))
        port = socket.localPort
        Thread({
            while (!socket.isClosed) {
                try {
                    val client = socket.accept()
                    pool.execute { serve(client) }
                } catch (_: Exception) {
                    break
                }
            }
        }, "blackout-tiles").apply { isDaemon = true }.start()
    }

    fun use(next: Pmtiles) {
        val previous = archive
        archive = next
        if (previous !== next) previous.close()
    }

    fun close() {
        runCatching { socket.close() }
        pool.shutdownNow()
        archive.close()
        world.close()
    }

    private fun serve(client: Socket) {
        client.soTimeout = 8000
        try {
            client.use { socket ->
                val reader = socket.getInputStream().bufferedReader()
                val request = reader.readLine() ?: return
                val path = request.split(' ').getOrNull(1)?.substringBefore('?') ?: return
                while (true) {
                    val line = reader.readLine() ?: break
                    if (line.isEmpty()) break
                }
                val body = body(path)
                val output = socket.getOutputStream()
                if (body == null) {
                    output.write("HTTP/1.1 204 No Content\r\nConnection: close\r\n\r\n".toByteArray())
                } else {
                    val type = when {
                        path.startsWith("/glyphs/") -> "application/x-protobuf"
                        path.startsWith("/countries") -> "application/geo+json"
                        else -> "application/vnd.mapbox-vector-tile"
                    }
                    val header = "HTTP/1.1 200 OK\r\nContent-Type: $type\r\nContent-Length: ${body.size}\r\nConnection: close\r\n\r\n"
                    output.write(header.toByteArray())
                    output.write(body)
                }
                output.flush()
            }
        } catch (_: Exception) {
        }
    }

    private fun body(path: String): ByteArray? {
        val parts = path.split('/').filter { it.isNotEmpty() }
        if (parts.firstOrNull() == "tiles" && parts.size == 5) {
            val z = parts[2].toIntOrNull() ?: return null
            val x = parts[3].toIntOrNull() ?: return null
            val y = parts[4].substringBefore('.').substringBefore('@').toIntOrNull() ?: return null
            return runCatching { archive.tile(z, x, y) }.getOrNull()
        }
        if (parts.firstOrNull() == "countries.geojson") {
            return try {
                assets.open("countries.geojson").use { it.readBytes() }
            } catch (_: Exception) {
                null
            }
        }
        if (parts.firstOrNull() == "world" && parts.size == 4) {
            val z = parts[1].toIntOrNull() ?: return null
            val x = parts[2].toIntOrNull() ?: return null
            val y = parts[3].substringBefore('.').substringBefore('@').toIntOrNull() ?: return null
            return world.tile(z, x, y)
        }
        if (parts.firstOrNull() == "glyphs" && parts.size == 3) {
            val font = URLDecoder.decode(parts[1], "UTF-8")
            val range = URLDecoder.decode(parts[2], "UTF-8").substringBefore('?')
            if (font.contains("..") || range.contains("..") || font.contains('/') || range.contains('/')) return null
            val name = "glyphs/$font/$range"
            return try {
                assets.open(name).use { it.readBytes() }
            } catch (_: Exception) {
                null
            }
        }
        return null
    }
}
