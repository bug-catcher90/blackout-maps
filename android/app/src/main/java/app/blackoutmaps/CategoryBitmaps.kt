package app.blackoutmaps

import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Path

object CategoryBitmaps {
    fun poi(density: Float, kind: Int): Bitmap = draw(density) { canvas, s ->
        disk(canvas, s, color(kind))
        when (kind) {
            0 -> cross(canvas, s)
            1 -> stroke(canvas, shield(), s)
            2 -> fillPath(canvas, flame(), s)
            3 -> {
                stroke(canvas, pumpBody(), s)
                stroke(canvas, hose(), s)
            }
            4 -> {
                stroke(canvas, basket(), s)
                stroke(canvas, handle(), s)
            }
            else -> stroke(canvas, fork(), s)
        }
    }

    fun water(density: Float): Bitmap = draw(density) { canvas, s ->
        disk(canvas, s, Color.parseColor("#0E7490"))
        fillPath(canvas, drop(), s)
    }

    private fun draw(density: Float, paint: (Canvas, Float) -> Unit): Bitmap {
        val px = (32f * density).toInt().coerceAtLeast(64)
        val bitmap = Bitmap.createBitmap(px, px, Bitmap.Config.ARGB_8888)
        val canvas = Canvas(bitmap)
        paint(canvas, px / 64f)
        return bitmap
    }

    private fun disk(canvas: Canvas, s: Float, color: Int) {
        val paint = fill(color)
        canvas.drawCircle(32f * s, 32f * s, 26f * s, paint)
        canvas.drawCircle(32f * s, 32f * s, 26f * s, strokePaint(Color.WHITE, 6f * s))
    }

    private fun cross(canvas: Canvas, s: Float) {
        val paint = fill(Color.WHITE)
        canvas.drawRect(28f * s, 16f * s, 36f * s, 48f * s, paint)
        canvas.drawRect(16f * s, 28f * s, 48f * s, 36f * s, paint)
    }

    private fun stroke(canvas: Canvas, path: Path, s: Float) {
        canvas.save()
        canvas.scale(s, s)
        canvas.drawPath(path, strokePaint(Color.WHITE, 4f))
        canvas.restore()
    }

    private fun fillPath(canvas: Canvas, path: Path, s: Float) {
        canvas.save()
        canvas.scale(s, s)
        canvas.drawPath(path, fill(Color.WHITE))
        canvas.restore()
    }

    private fun shield() = Path().apply {
        moveTo(32f, 14f)
        lineTo(48f, 20f)
        lineTo(44f, 38f)
        quadTo(32f, 50f, 20f, 38f)
        lineTo(16f, 20f)
        close()
    }

    private fun flame() = Path().apply {
        moveTo(32f, 14f)
        quadTo(46f, 28f, 40f, 42f)
        quadTo(32f, 50f, 24f, 42f)
        quadTo(18f, 28f, 32f, 14f)
        close()
    }

    private fun pumpBody() = Path().apply { addRect(26f, 16f, 38f, 44f, Path.Direction.CW) }

    private fun hose() = Path().apply {
        moveTo(38f, 20f)
        lineTo(46f, 20f)
        lineTo(46f, 30f)
        lineTo(38f, 30f)
    }

    private fun basket() = Path().apply { addRect(18f, 26f, 46f, 44f, Path.Direction.CW) }

    private fun handle() = Path().apply {
        moveTo(22f, 26f)
        lineTo(26f, 16f)
        lineTo(40f, 16f)
        lineTo(44f, 26f)
    }

    private fun fork() = Path().apply {
        moveTo(24f, 14f)
        lineTo(24f, 36f)
        moveTo(30f, 14f)
        lineTo(30f, 36f)
        moveTo(40f, 14f)
        lineTo(40f, 28f)
        quadTo(40f, 36f, 32f, 36f)
    }

    private fun drop() = Path().apply {
        moveTo(32f, 14f)
        cubicTo(46f, 30f, 44f, 40f, 32f, 48f)
        cubicTo(20f, 40f, 18f, 30f, 32f, 14f)
        close()
    }

    private fun color(kind: Int) = when (kind) {
        0 -> Color.parseColor("#0F6B4C")
        1 -> Color.parseColor("#1D4ED8")
        2 -> Color.parseColor("#DC2626")
        3 -> Color.parseColor("#7C3AED")
        4 -> Color.parseColor("#B45309")
        else -> Color.parseColor("#BE185D")
    }

    private fun fill(color: Int) = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        style = Paint.Style.FILL
        this.color = color
    }

    private fun strokePaint(color: Int, width: Float) = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        style = Paint.Style.STROKE
        this.color = color
        strokeWidth = width
        strokeCap = Paint.Cap.ROUND
        strokeJoin = Paint.Join.ROUND
    }
}
