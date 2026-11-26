plugins {
  alias(libs.plugins.android.application)
}

android {
  namespace = "com.afterlane.racing"
  compileSdk = 36

  defaultConfig {
    applicationId = "com.afterlane.racing"
    minSdk = 24
    targetSdk = 36
    versionCode = 1
    versionName = "1.0"
  }

  signingConfigs {
    create("release") {
      val ks = file("release.keystore")
      val ksPass = System.getenv("AFTERLANE_KS_PASS")
      val keyPass = System.getenv("AFTERLANE_KEY_PASS") ?: ksPass
      if (ks.exists() && !ksPass.isNullOrEmpty() && !keyPass.isNullOrEmpty()) {
        storeFile = ks
        storePassword = ksPass
        keyAlias = "afterlane"
        keyPassword = keyPass
      }
    }
  }

  buildTypes {
    release {
      isMinifyEnabled = true
      isShrinkResources = true
      proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
      val ks = file("release.keystore")
      val ksPass = System.getenv("AFTERLANE_KS_PASS")
      if (ks.exists() && !ksPass.isNullOrEmpty()) {
        signingConfig = signingConfigs.getByName("release")
      }
    }
  }

  compileOptions {
    sourceCompatibility = JavaVersion.VERSION_17
    targetCompatibility = JavaVersion.VERSION_17
  }
}

kotlin {
  jvmToolchain(17)
}

dependencies {
  implementation(libs.androidx.core.ktx)
  implementation(libs.androidx.activity.ktx)
}
