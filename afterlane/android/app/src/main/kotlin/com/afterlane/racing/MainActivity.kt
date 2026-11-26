package com.afterlane.racing

import android.annotation.SuppressLint
import android.content.ComponentName
import android.content.Intent
import android.graphics.Color
import android.graphics.Typeface
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
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
import androidx.browser.customtabs.CustomTabColorSchemeParams
import androidx.browser.customtabs.CustomTabsCallback
import androidx.browser.customtabs.CustomTabsClient
import androidx.browser.customtabs.CustomTabsService
import androidx.browser.customtabs.CustomTabsServiceConnection
import androidx.browser.trusted.ScreenOrientation
import androidx.browser.trusted.TrustedWebActivityDisplayMode
import androidx.browser.trusted.TrustedWebActivityIntentBuilder
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import java.net.HttpURLConnection
import java.net.URL

class MainActivity : ComponentActivity() {
  private lateinit var rootLayout: FrameLayout
  private lateinit var splashOverlay: LinearLayout
  private lateinit var statusText: TextView
  private lateinit var progressBar: ProgressBar
  private lateinit var retryButton: Button

  private val mainHandler = Handler(Looper.getMainLooper())
  private var webView: WebView? = null
  private var customTabsConnection: CustomTabsServiceConnection? = null
  private var fallbackTimeoutRunnable: Runnable? = null

  private var lastBackAt = 0L
  private var pageLoaded = false
  private var launchedTwa = false
  private var fallbackStarted = false
  private var destroyed = false

  private val originUrl = "https://afterlane.onrender.com"
  private val gameUrl = "https://afterlane.onrender.com/"
  private val assetLinksUrl = "https://afterlane.onrender.com/.well-known/assetlinks.json"

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)

    window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
    WindowCompat.setDecorFitsSystemWindows(window, false)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
      window.attributes.layoutInDisplayCutoutMode =
        WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES
    }
    hideSystemBars()

    rootLayout = FrameLayout(this).apply {
      setBackgroundColor(Color.parseColor("#10151B"))
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
      isIndeterminate = true
    }

    retryButton = Button(this).apply {
      text = "Retry Connection"
      visibility = View.GONE
      setOnClickListener {
        startConnection()
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

    rootLayout.addView(splashOverlay, FrameLayout.LayoutParams(-1, -1))
    setContentView(rootLayout)

    onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
      override fun handleOnBackPressed() {
        val wv = webView
        if (wv == null) {
          finish()
          return
        }
        wv.evaluateJavascript(
          "window.__afterlane && (window.__afterlane().playing || document.querySelector('dialog[open],body.editing-controls'))"
        ) { active ->
          if (active == "true") {
            wv.dispatchKeyEvent(
              android.view.KeyEvent(android.view.KeyEvent.ACTION_DOWN, android.view.KeyEvent.KEYCODE_ESCAPE)
            )
            wv.dispatchKeyEvent(
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

    startConnection()
  }

  private fun startConnection() {
    retryButton.visibility = View.GONE
    progressBar.visibility = View.VISIBLE
    progressBar.isIndeterminate = true
    statusText.text = "Connecting to Route 07… (first server wake may take ~30s)"

    if (fallbackStarted && webView != null) {
      progressBar.isIndeterminate = false
      progressBar.progress = 15
      webView?.loadUrl(gameUrl)
      return
    }

    Thread {
      var serverReachable = false
      var assetLinksValid = false
      var conn: HttpURLConnection? = null
      try {
        conn = (URL(assetLinksUrl).openConnection() as HttpURLConnection).apply {
          connectTimeout = 40_000
          readTimeout = 40_000
          useCaches = false
          requestMethod = "GET"
        }
        val code = conn.responseCode
        if (code in 200..299) {
          serverReachable = true
          val body = conn.inputStream.bufferedReader().use { it.readText() }
          assetLinksValid = body.contains("com.afterlane.racing")
        } else if (code in 300..499) {
          serverReachable = true
        }
      } catch (_: Exception) {
        serverReachable = false
      } finally {
        conn?.disconnect()
      }

      mainHandler.post {
        if (destroyed) return@post
        if (!serverReachable) {
          progressBar.visibility = View.INVISIBLE
          statusText.text = "Unable to connect. Check internet or server startup and retry."
          retryButton.visibility = View.VISIBLE
          return@post
        }

        val browserPackage = if (assetLinksValid) findTwaBrowserPackage() else null
        if (browserPackage != null) {
          statusText.text = "Launching Chrome fullscreen engine…"
          tryLaunchTrustedWebActivity(browserPackage)
        } else {
          launchWebViewFallback()
        }
      }
    }.start()
  }

  private fun findTwaBrowserPackage(): String? {
    val preferred = listOf(
      "com.android.chrome",
      "com.chrome.beta",
      "com.chrome.dev",
      "com.chrome.canary",
      "com.sec.android.app.sbrowser",
      "com.brave.browser",
      "com.microsoft.emmx",
      "com.opera.browser",
    )
    return CustomTabsClient.getPackageName(this, preferred, true)
      ?: CustomTabsClient.getPackageName(this, null, false)
  }

  private fun tryLaunchTrustedWebActivity(browserPackage: String) {
    val timeout = Runnable {
      if (!launchedTwa && !fallbackStarted && !destroyed) {
        unbindCustomTabs()
        launchWebViewFallback()
      }
    }
    fallbackTimeoutRunnable = timeout
    mainHandler.postDelayed(timeout, 3500)

    val connection = object : CustomTabsServiceConnection() {
      override fun onCustomTabsServiceConnected(name: ComponentName, client: CustomTabsClient) {
        if (destroyed || launchedTwa || fallbackStarted) return
        client.warmup(0L)
        val callback = object : CustomTabsCallback() {
          override fun onRelationshipValidationResult(
            relation: Int,
            requestedOrigin: Uri,
            result: Boolean,
            extras: Bundle?
          ) {
            mainHandler.post {
              if (destroyed || launchedTwa || fallbackStarted) return@post
              if (relation != CustomTabsService.RELATION_HANDLE_ALL_URLS) return@post
              cancelFallbackTimeout()
              val activeSession = validatedSession
              if (!result || activeSession == null) {
                unbindCustomTabs()
                launchWebViewFallback()
                return@post
              }
              launchTwaWithSession(activeSession)
            }
          }
        }
        val session = client.newSession(callback)
        if (session == null) {
          cancelFallbackTimeout()
          unbindCustomTabs()
          launchWebViewFallback()
          return
        }
        session.mayLaunchUrl(Uri.parse(gameUrl), null, null)
        // Re-create session? No: reuse validated session cleanly via holder below!
        validatedSession = session
        val requested = session.validateRelationship(
          CustomTabsService.RELATION_HANDLE_ALL_URLS,
          Uri.parse(originUrl),
          null
        )
        if (!requested) {
          cancelFallbackTimeout()
          unbindCustomTabs()
          launchWebViewFallback()
        }
      }

      override fun onServiceDisconnected(name: ComponentName?) {
        customTabsConnection = null
        validatedSession = null
      }
    }

    customTabsConnection = connection
    val bound = CustomTabsClient.bindCustomTabsService(this, browserPackage, connection)
    if (!bound) {
      cancelFallbackTimeout()
      customTabsConnection = null
      launchWebViewFallback()
    }
  }

  private var validatedSession: androidx.browser.customtabs.CustomTabsSession? = null

  private fun launchTwaWithSession(activeSession: androidx.browser.customtabs.CustomTabsSession) {
    val cutoutMode = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
      WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES
    } else 0
    val colors = CustomTabColorSchemeParams.Builder()
      .setToolbarColor(Color.parseColor("#10151B"))
      .setNavigationBarColor(Color.parseColor("#10151B"))
      .setNavigationBarDividerColor(Color.parseColor("#10151B"))
      .build()
    val twaIntent = TrustedWebActivityIntentBuilder(Uri.parse(gameUrl))
      .setDefaultColorSchemeParams(colors)
      .setDisplayMode(TrustedWebActivityDisplayMode.ImmersiveMode(true, cutoutMode))
      .setScreenOrientation(ScreenOrientation.LANDSCAPE)
      .build(activeSession)
    launchedTwa = true
    twaIntent.launchTrustedWebActivity(this)
  }

  private fun cancelFallbackTimeout() {
    fallbackTimeoutRunnable?.let { mainHandler.removeCallbacks(it) }
    fallbackTimeoutRunnable = null
  }

  private fun unbindCustomTabs() {
    val conn = customTabsConnection ?: return
    customTabsConnection = null
    validatedSession = null
    try {
      unbindService(conn)
    } catch (_: IllegalArgumentException) {
    }
  }

  @SuppressLint("SetJavaScriptEnabled")
  private fun launchWebViewFallback() {
    if (fallbackStarted || destroyed) return
    fallbackStarted = true
    progressBar.isIndeterminate = false
    progressBar.progress = 20
    statusText.text = "Loading Route 07…"

    val wv = WebView(this).apply {
      setBackgroundColor(Color.parseColor("#10151B"))
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        setRendererPriorityPolicy(WebView.RENDERER_PRIORITY_IMPORTANT, false)
      }
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

    webView = wv
    rootLayout.addView(wv, 0, FrameLayout.LayoutParams(-1, -1))
    wv.loadUrl(gameUrl)
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

  override fun onStop() {
    super.onStop()
    if (launchedTwa && !isFinishing) {
      unbindCustomTabs()
      finish()
    }
  }

  override fun onResume() {
    super.onResume()
    webView?.onResume()
  }

  override fun onPause() {
    webView?.onPause()
    super.onPause()
  }

  override fun onDestroy() {
    destroyed = true
    cancelFallbackTimeout()
    unbindCustomTabs()
    webView?.destroy()
    webView = null
    super.onDestroy()
  }
}
