package com.afterlane.racing

import android.annotation.SuppressLint
import android.content.Intent
import android.graphics.Color
import android.graphics.Typeface
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.view.Gravity
import android.view.View
import android.view.WindowManager
import android.webkit.WebChromeClient
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Button
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.ProgressBar
import android.widget.TextView
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.activity.OnBackPressedCallback
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat

class MainActivity : ComponentActivity() {
  private lateinit var webView: WebView
  private lateinit var splashOverlay: LinearLayout
  private lateinit var statusText: TextView
  private lateinit var progressBar: ProgressBar
  private lateinit var retryButton: Button
  private var lastBackAt = 0L
  private var pageLoaded = false

  private val gameUrl = "https://afterlane.onrender.com/"

  @SuppressLint("SetJavaScriptEnabled")
  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)

    window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
    WindowCompat.setDecorFitsSystemWindows(window, false)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
      window.attributes.layoutInDisplayCutoutMode =
        WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES
    }
    hideSystemBars()

    val root = FrameLayout(this).apply {
      setBackgroundColor(Color.parseColor("#10151B"))
    }

    webView = WebView(this).apply {
      setBackgroundColor(Color.parseColor("#10151B"))
      settings.apply {
        javaScriptEnabled = true
        domStorageEnabled = true
        mediaPlaybackRequiresUserGesture = false
        useWideViewPort = true
        loadWithOverviewMode = true
        builtInZoomControls = false
        displayZoomControls = false
        cacheMode = WebSettings.LOAD_DEFAULT
        mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
        userAgentString = "$userAgentString AfterlaneAndroid/1.0"
      }
      webChromeClient = object : WebChromeClient() {
        override fun onProgressChanged(view: WebView?, newProgress: Int) {
          progressBar.progress = newProgress
          if (newProgress >= 90) {
            statusText.text = "Starting 3D highway engine…"
          }
        }
      }
      webViewClient = object : WebViewClient() {
        override fun shouldOverrideUrlLoading(view: WebView?, request: WebResourceRequest?): Boolean {
          val url = request?.url ?: return false
          val host = url.host ?: ""
          if (host == "afterlane.onrender.com") {
            if (url.path?.endsWith(".apk") == true) return true
            return false
          }
          startActivity(Intent(Intent.ACTION_VIEW, url))
          return true
        }

        override fun onPageFinished(view: WebView?, url: String?) {
          super.onPageFinished(view, url)
          val parsedHost = url?.let { Uri.parse(it).host }
          if (!pageLoaded && parsedHost == "afterlane.onrender.com") {
            pageLoaded = true
            splashOverlay.animate().alpha(0f).setDuration(280).withEndAction {
              splashOverlay.visibility = View.GONE
            }.start()
          }
        }

        override fun onReceivedError(
          view: WebView?,
          request: WebResourceRequest?,
          error: WebResourceError?
        ) {
          if (request?.isForMainFrame == true) {
            pageLoaded = false
            splashOverlay.alpha = 1f
            splashOverlay.visibility = View.VISIBLE
            progressBar.visibility = View.INVISIBLE
            statusText.text = "Unable to connect. Check internet or server startup and retry."
            retryButton.visibility = View.VISIBLE
          }
        }
      }
    }

    val dp = resources.displayMetrics.density
    splashOverlay = LinearLayout(this).apply {
      orientation = LinearLayout.VERTICAL
      gravity = Gravity.CENTER
      setBackgroundColor(Color.parseColor("#10151B"))
      setPadding((32 * dp).toInt(), (24 * dp).toInt(), (32 * dp).toInt(), (24 * dp).toInt())
    }

    val title = TextView(this).apply {
      text = "AFTERLANE"
      textSize = 28f
      typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
      letterSpacing = 0.2f
      setTextColor(Color.parseColor("#FFC176"))
      gravity = Gravity.CENTER
    }

    statusText = TextView(this).apply {
      text = "Connecting to Route 07… (first server wake may take ~30s)"
      textSize = 14f
      setTextColor(Color.parseColor("#C9D3D9"))
      gravity = Gravity.CENTER
      setPadding(0, (12 * dp).toInt(), 0, (16 * dp).toInt())
    }

    progressBar = ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal).apply {
      max = 100
      progress = 15
    }

    retryButton = Button(this).apply {
      text = "Retry Connection"
      visibility = View.GONE
      setOnClickListener {
        visibility = View.GONE
        progressBar.visibility = View.VISIBLE
        progressBar.progress = 10
        statusText.text = "Reconnecting to Afterlane…"
        webView.loadUrl(gameUrl)
      }
    }

    val barParams = LinearLayout.LayoutParams((260 * dp).toInt(), (16 * dp).toInt())
    val btnParams = LinearLayout.LayoutParams(
      LinearLayout.LayoutParams.WRAP_CONTENT,
      LinearLayout.LayoutParams.WRAP_CONTENT
    ).apply { topMargin = (14 * dp).toInt() }

    splashOverlay.addView(title)
    splashOverlay.addView(statusText)
    splashOverlay.addView(progressBar, barParams)
    splashOverlay.addView(retryButton, btnParams)

    root.addView(webView, FrameLayout.LayoutParams(-1, -1))
    root.addView(splashOverlay, FrameLayout.LayoutParams(-1, -1))
    setContentView(root)

    onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
      override fun handleOnBackPressed() {
        webView.evaluateJavascript(
          "window.__afterlane && (window.__afterlane().playing || document.querySelector('dialog[open],body.editing-controls'))"
        ) { active ->
          if (active == "true") {
            webView.dispatchKeyEvent(
              android.view.KeyEvent(android.view.KeyEvent.ACTION_DOWN, android.view.KeyEvent.KEYCODE_ESCAPE)
            )
            webView.dispatchKeyEvent(
              android.view.KeyEvent(android.view.KeyEvent.ACTION_UP, android.view.KeyEvent.KEYCODE_ESCAPE)
            )
          } else {
            val now = System.currentTimeMillis()
            if (now - lastBackAt < 2000) {
              finish()
            } else {
              lastBackAt = now
              Toast.makeText(this@MainActivity, "Press Back again to exit Afterlane", Toast.LENGTH_SHORT).show()
            }
          }
        }
      }
    })

    webView.loadUrl(gameUrl)
  }

  private fun hideSystemBars() {
    val controller = WindowInsetsControllerCompat(window, window.decorView)
    controller.hide(WindowInsetsCompat.Type.systemBars())
    controller.systemBarsBehavior = WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
  }

  override fun onWindowFocusChanged(hasFocus: Boolean) {
    super.onWindowFocusChanged(hasFocus)
    if (hasFocus) hideSystemBars()
  }

  override fun onResume() {
    super.onResume()
    webView.onResume()
  }

  override fun onPause() {
    webView.onPause()
    super.onPause()
  }

  override fun onDestroy() {
    webView.destroy()
    super.onDestroy()
  }
}
