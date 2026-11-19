package app.blackoutmaps

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import org.maplibre.android.MapLibre

class BlackoutApp : android.app.Application() {
    override fun onCreate() {
        super.onCreate()
        MapLibre.getInstance(this)
    }
}

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent { BlackoutScreen() }
    }
}
