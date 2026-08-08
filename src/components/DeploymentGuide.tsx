import React, { useState } from "react";
import {
  Rocket,
  Key,
  Box,
  CheckSquare,
  Square,
  FileCode,
  Terminal,
  ExternalLink,
  ShieldCheck,
  Layers,
  Cpu,
  Copy,
  Check,
  Folder,
  Download,
  Smartphone,
  Sparkles,
  AlertTriangle,
  ChevronRight,
  Info,
  HelpCircle,
  Code,
  Wrench,
  Shield
} from "lucide-react";

interface DeploymentGuideProps {
  onBackToApp?: () => void;
}

export const DeploymentGuide: React.FC<DeploymentGuideProps> = ({ onBackToApp }) => {
  const [copiedSnippet, setCopiedSnippet] = useState<string | null>(null);
  
  // Interactive checklist state
  const [completedSteps, setCompletedSteps] = useState<Record<string, boolean>>({
    export: false,
    import: false,
    keystore: false,
    r8: false,
    build: false,
    install: false
  });

  const toggleStep = (id: string) => {
    setCompletedSteps(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const completedCount = Object.values(completedSteps).filter(Boolean).length;
  const progressPercent = Math.round((completedCount / 6) * 100);

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopiedSnippet(label);
    setTimeout(() => setCopiedSnippet(null), 2000);
  };

  const SIGNING_CONFIG_SNIPPET = `// android/app/build.gradle.kts
android {
    namespace = "com.enrique.callguard"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.enrique.callguard"
        minSdk = 26
        targetSdk = 35
        versionCode = 1
        versionName = "1.0.0"
    }

    // 1. Release Signing Configuration
    signingConfigs {
        create("release") {
            // Place release-key.jks in the android/app/ directory
            storeFile = file("release-key.jks")
            storePassword = System.getenv("KEYSTORE_PASSWORD") ?: "YourStorePassword"
            keyAlias = System.getenv("KEY_ALIAS") ?: "callguard-key"
            keyPassword = System.getenv("KEY_PASSWORD") ?: "YourKeyPassword"
        }
    }

    buildTypes {
        getByName("release") {
            // Attach signing configuration
            signingConfig = signingConfigs.getByName("release")
            
            // 2. Enable R8 Code Shrinking & Obfuscation
            isMinifyEnabled = true
            
            // 3. Enable Unused Resource Stripping
            isShrinkResources = true
            
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
        }
    }
}`;

  const PROGUARD_RULES_SNIPPET = `# android/app/proguard-rules.pro

# --- 1. CALL SCREENING SERVICE PRESERVATION ---
# Ensure Android OS Telecom system can locate and invoke CallScreeningServiceImpl
-keep public class com.enrique.callguard.service.CallScreeningServiceImpl { *; }
-keep public class * extends android.telecom.CallScreeningService

# --- 2. ROOM SQLITE DATABASE PRESERVATION ---
-keep class androidx.room.** { *; }
-dontwarn androidx.room.**
-keep class com.enrique.callguard.data.** { *; }
-keepclassmembers class * extends androidx.room.RoomDatabase {
    public <init>();
}

# --- 3. JETPACK COMPOSE & VIEWMODELS ---
-keepclassmembers class * extends androidx.lifecycle.ViewModel {
    public <init>(...);
}

# --- 4. R8 AGGRESSIVE OPTIMIZATIONS ---
-repackageclasses ''
-allowaccessmodification
-dontusemixedcaseclassnames`;

  const KEYTOOL_COMMAND = `keytool -genkey -v -keystore release-key.jks -keyalg RSA -keysize 2048 -validity 10000 -alias callguard-key`;

  const BUILD_CLI_COMMANDS = `# Navigate to the native android root directory
cd android

# Build Signed Release APK
./gradlew assembleRelease

# Build Signed Google Play App Bundle (.aab)
./gradlew bundleRelease`;

  const ADB_INSTALL_COMMAND = `adb install -r app/build/outputs/apk/release/app-release.apk`;

  return (
    <div className="w-full max-w-6xl mx-auto space-y-8 text-left text-slate-100 pb-16">
      
      {/* HEADER HERO BANNER */}
      <div className="relative overflow-hidden bg-gradient-to-r from-blue-950 via-slate-900 to-slate-950 border border-blue-500/20 rounded-3xl p-6 sm:p-8 shadow-2xl">
        <div className="absolute top-0 right-0 -mt-12 -mr-12 w-64 h-64 bg-blue-500/10 rounded-full blur-3xl pointer-events-none"></div>
        
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-3 max-w-2xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400 text-xs font-semibold">
              <Rocket className="h-3.5 w-3.5" />
              <span>Android Production Deployment Center</span>
            </div>
            
            <h2 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
              APK & Release Deployment Guide
            </h2>
            
            <p className="text-sm text-slate-300 leading-relaxed">
              Step-by-step technical manual for compiling the native Kotlin source codebase (<code className="text-blue-300 font-mono bg-slate-900 px-1.5 py-0.5 rounded border border-slate-800">/android</code>) in Android Studio, configuring production release keystore signing, enabling R8 code shrinking, and generating APK/AAB binaries.
            </p>
          </div>

          {/* BACK TO APP BUTTON IF IN FULL VIEW */}
          {onBackToApp && (
            <button
              onClick={onBackToApp}
              className="self-start md:self-center px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold flex items-center gap-2 border border-slate-700 transition-colors shadow-lg"
            >
              <Smartphone className="h-4 w-4 text-blue-400" />
              <span>Return to Live Simulator</span>
            </button>
          )}
        </div>

        {/* PROGRESS BAR STRIP */}
        <div className="mt-8 pt-6 border-t border-slate-800/80 grid grid-cols-1 md:grid-cols-12 gap-4 items-center">
          <div className="md:col-span-8 space-y-2">
            <div className="flex justify-between items-center text-xs">
              <span className="font-semibold text-slate-300 flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-emerald-400" />
                Release Preparation Checklist
              </span>
              <span className="font-bold text-blue-400">{completedCount} of 6 Steps Completed ({progressPercent}%)</span>
            </div>
            <div className="w-full h-2.5 bg-slate-900 rounded-full overflow-hidden border border-slate-800">
              <div
                className="h-full bg-gradient-to-r from-blue-600 to-emerald-400 transition-all duration-500 rounded-full"
                style={{ width: `${progressPercent}%` }}
              ></div>
            </div>
          </div>
          <div className="md:col-span-4 flex justify-end">
            <div className="text-[11px] text-slate-400 bg-slate-900/80 px-3 py-1.5 rounded-xl border border-slate-800">
              Target SDK: <span className="text-white font-bold">35</span> • Min SDK: <span className="text-white font-bold">26</span> • R8: <span className="text-emerald-400 font-bold">Enabled</span>
            </div>
          </div>
        </div>
      </div>

      {/* STEP 1: EXPORT CODEBASE */}
      <div className={`bg-slate-900/90 border ${completedSteps.export ? "border-emerald-500/40 bg-emerald-950/10" : "border-slate-800"} rounded-2xl p-6 transition-all space-y-4`}>
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <button 
              onClick={() => toggleStep("export")}
              className="mt-0.5 text-slate-400 hover:text-white transition-colors"
            >
              {completedSteps.export ? (
                <CheckSquare className="h-6 w-6 text-emerald-400" />
              ) : (
                <Square className="h-6 w-6 text-slate-600 hover:text-slate-400" />
              )}
            </button>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold uppercase tracking-wider text-blue-400">Step 1</span>
                <span className="text-xs px-2 py-0.5 rounded bg-slate-800 text-slate-300 font-mono">Source Directory</span>
              </div>
              <h3 className="text-lg font-bold text-white mt-0.5">Export & Obtain Native Android Repository</h3>
            </div>
          </div>
          
          <span className="hidden sm:inline-flex px-3 py-1 rounded-full bg-slate-800 text-slate-300 text-xs font-medium border border-slate-700">
            Export ZIP / GitHub
          </span>
        </div>

        <p className="text-xs text-slate-300 leading-relaxed pl-9">
          The full native Android project layout is housed inside the <code className="text-blue-300 font-mono bg-slate-950 px-1.5 py-0.5 rounded">/android</code> directory of this workspace.
        </p>

        <div className="pl-9 space-y-3 text-xs">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-2">
              <div className="flex items-center gap-2 font-bold text-white">
                <Smartphone className="h-4 w-4 text-blue-400" />
                <span>On Mobile (AI Studio Mobile)</span>
              </div>
              <p className="text-slate-400 leading-relaxed text-[11px]">
                If export option is hidden on mobile layout: Open AI Studio app menu at top right, tap <strong>Export to GitHub</strong> or <strong>Download ZIP</strong>. All files under <code className="text-slate-200 font-mono">/android</code> will be included in the downloaded repository.
              </p>
            </div>

            <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-2">
              <div className="flex items-center gap-2 font-bold text-white">
                <Download className="h-4 w-4 text-emerald-400" />
                <span>On Desktop / Browser</span>
              </div>
              <p className="text-slate-400 leading-relaxed text-[11px]">
                Click the project Settings gear icon in AI Studio to export directly to a new GitHub repository or download a complete <code className="text-slate-200 font-mono">.zip</code> archive to your local hard drive.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* STEP 2: OPEN IN ANDROID STUDIO */}
      <div className={`bg-slate-900/90 border ${completedSteps.import ? "border-emerald-500/40 bg-emerald-950/10" : "border-slate-800"} rounded-2xl p-6 transition-all space-y-4`}>
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <button 
              onClick={() => toggleStep("import")}
              className="mt-0.5 text-slate-400 hover:text-white transition-colors"
            >
              {completedSteps.import ? (
                <CheckSquare className="h-6 w-6 text-emerald-400" />
              ) : (
                <Square className="h-6 w-6 text-slate-600 hover:text-slate-400" />
              )}
            </button>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold uppercase tracking-wider text-blue-400">Step 2</span>
                <span className="text-xs px-2 py-0.5 rounded bg-slate-800 text-slate-300 font-mono">IDE Setup</span>
              </div>
              <h3 className="text-lg font-bold text-white mt-0.5">Import into Android Studio & Sync Gradle</h3>
            </div>
          </div>
          
          <span className="hidden sm:inline-flex px-3 py-1 rounded-full bg-slate-800 text-slate-300 text-xs font-medium border border-slate-700">
            JDK 17+ Required
          </span>
        </div>

        <div className="pl-9 space-y-3 text-xs text-slate-300">
          <ol className="list-decimal list-inside space-y-2 text-slate-300 leading-relaxed">
            <li>Launch <strong>Android Studio Koala, Ladybug, or Jellyfish (2024.1+)</strong>.</li>
            <li>Click <strong>Open</strong> and navigate to the extracted repository root, then select the <code className="text-blue-300 font-mono bg-slate-950 px-1.5 py-0.5 rounded">/android</code> folder (where <code className="text-slate-300 font-mono">settings.gradle.kts</code> is located).</li>
            <li>Allow Gradle to automatically download dependencies (Jetpack Compose BOM, Room 2.6.1, AndroidX Core, Telecom APIs).</li>
            <li>Verify Gradle JDK is configured to <strong>Java 17 or higher</strong> under <i>Settings/Preferences &gt; Build, Execution, Deployment &gt; Build Tools &gt; Gradle &gt; Gradle JDK</i>.</li>
          </ol>
        </div>
      </div>

      {/* STEP 3: KEYSTORE & SIGNING CONFIGURATION */}
      <div className={`bg-slate-900/90 border ${completedSteps.keystore ? "border-emerald-500/40 bg-emerald-950/10" : "border-slate-800"} rounded-2xl p-6 transition-all space-y-4`}>
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <button 
              onClick={() => toggleStep("keystore")}
              className="mt-0.5 text-slate-400 hover:text-white transition-colors"
            >
              {completedSteps.keystore ? (
                <CheckSquare className="h-6 w-6 text-emerald-400" />
              ) : (
                <Square className="h-6 w-6 text-slate-600 hover:text-slate-400" />
              )}
            </button>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold uppercase tracking-wider text-blue-400">Step 3</span>
                <span className="text-xs px-2 py-0.5 rounded bg-slate-800 text-slate-300 font-mono">Signing Credentials</span>
              </div>
              <h3 className="text-lg font-bold text-white mt-0.5">Generate Keystore & Configure <code className="text-blue-300 font-mono">signingConfigs</code></h3>
            </div>
          </div>
          
          <span className="hidden sm:inline-flex px-3 py-1 rounded-full bg-slate-800 text-slate-300 text-xs font-medium border border-slate-700">
            Release Certificate
          </span>
        </div>

        <div className="pl-9 space-y-4 text-xs">
          <p className="text-slate-300 leading-relaxed">
            Android requires all release APKs to be cryptographically signed before installation or Google Play store uploading.
          </p>

          {/* Keytool Command Box */}
          <div className="space-y-1.5">
            <div className="flex justify-between items-center text-slate-400">
              <span className="font-semibold text-[11px] flex items-center gap-1.5 text-slate-300">
                <Terminal className="h-3.5 w-3.5 text-blue-400" /> Generate Release Keystore via Terminal
              </span>
              <button
                onClick={() => copyToClipboard(KEYTOOL_COMMAND, "keytool")}
                className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px] font-mono flex items-center gap-1 border border-slate-700 transition-colors"
              >
                {copiedSnippet === "keytool" ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
                {copiedSnippet === "keytool" ? "Copied!" : "Copy"}
              </button>
            </div>
            <pre className="p-3 bg-slate-950 border border-slate-800 rounded-xl font-mono text-[11px] text-blue-300 overflow-x-auto select-text">
              <code>{KEYTOOL_COMMAND}</code>
            </pre>
            <p className="text-[10px] text-slate-400">Place the generated <code className="text-slate-200 font-mono">release-key.jks</code> inside the <code className="text-slate-200 font-mono">android/app/</code> directory.</p>
          </div>

          {/* Gradle snippet */}
          <div className="space-y-1.5">
            <div className="flex justify-between items-center text-slate-400">
              <span className="font-semibold text-[11px] flex items-center gap-1.5 text-slate-300">
                <FileCode className="h-3.5 w-3.5 text-emerald-400" /> Update <code className="text-blue-300 font-mono">android/app/build.gradle.kts</code>
              </span>
              <button
                onClick={() => copyToClipboard(SIGNING_CONFIG_SNIPPET, "gradle_signing")}
                className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px] font-mono flex items-center gap-1 border border-slate-700 transition-colors"
              >
                {copiedSnippet === "gradle_signing" ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
                {copiedSnippet === "gradle_signing" ? "Copied!" : "Copy Gradle Code"}
              </button>
            </div>
            <pre className="p-4 bg-slate-950 border border-slate-800 rounded-xl font-mono text-[11px] leading-relaxed text-slate-300 overflow-x-auto max-h-72 select-text">
              <code>{SIGNING_CONFIG_SNIPPET}</code>
            </pre>
          </div>
        </div>
      </div>

      {/* STEP 4: R8 SHRINKING & PROGUARD RULES */}
      <div className={`bg-slate-900/90 border ${completedSteps.r8 ? "border-emerald-500/40 bg-emerald-950/10" : "border-slate-800"} rounded-2xl p-6 transition-all space-y-4`}>
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <button 
              onClick={() => toggleStep("r8")}
              className="mt-0.5 text-slate-400 hover:text-white transition-colors"
            >
              {completedSteps.r8 ? (
                <CheckSquare className="h-6 w-6 text-emerald-400" />
              ) : (
                <Square className="h-6 w-6 text-slate-600 hover:text-slate-400" />
              )}
            </button>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold uppercase tracking-wider text-blue-400">Step 4</span>
                <span className="text-xs px-2 py-0.5 rounded bg-slate-800 text-slate-300 font-mono">APK Optimization</span>
              </div>
              <h3 className="text-lg font-bold text-white mt-0.5">R8 Code Shrinking, Resource Stripping & ProGuard Rules</h3>
            </div>
          </div>
          
          <span className="hidden sm:inline-flex px-3 py-1 rounded-full bg-slate-800 text-slate-300 text-xs font-medium border border-slate-700">
            Minify & Obfuscate
          </span>
        </div>

        <div className="pl-9 space-y-4 text-xs text-slate-300">
          <div className="bg-slate-950 border border-slate-800 p-4 rounded-xl space-y-2">
            <h4 className="font-bold text-white flex items-center gap-2">
              <Cpu className="h-4 w-4 text-amber-400" /> Why R8 Shrinking is Essential for CallGuard:
            </h4>
            <ul className="list-disc list-inside space-y-1 text-slate-400 text-[11px] leading-relaxed">
              <li><strong>Size Reduction:</strong> Removes unused Kotlin bytecode and unused XML/Compose resources, shrinking APK size by up to 60%.</li>
              <li><strong>Security & Obfuscation:</strong> Renames class names and variables to protect sensitive phone screening logic from reverse engineering.</li>
              <li><strong>Reflection Protection:</strong> Custom ProGuard rules (<code className="text-slate-200 font-mono">proguard-rules.pro</code>) ensure reflection used by Room Database and <code className="text-slate-200 font-mono">CallScreeningService</code> are preserved.</li>
            </ul>
          </div>

          <div className="space-y-1.5">
            <div className="flex justify-between items-center text-slate-400">
              <span className="font-semibold text-[11px] flex items-center gap-1.5 text-slate-300">
                <FileCode className="h-3.5 w-3.5 text-blue-400" /> Production Rules for <code className="text-blue-300 font-mono">android/app/proguard-rules.pro</code>
              </span>
              <button
                onClick={() => copyToClipboard(PROGUARD_RULES_SNIPPET, "proguard")}
                className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px] font-mono flex items-center gap-1 border border-slate-700 transition-colors"
              >
                {copiedSnippet === "proguard" ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
                {copiedSnippet === "proguard" ? "Copied!" : "Copy ProGuard Rules"}
              </button>
            </div>
            <pre className="p-4 bg-slate-950 border border-slate-800 rounded-xl font-mono text-[11px] leading-relaxed text-slate-300 overflow-x-auto max-h-64 select-text">
              <code>{PROGUARD_RULES_SNIPPET}</code>
            </pre>
          </div>
        </div>
      </div>

      {/* STEP 5: COMPILING & BUILDING APK */}
      <div className={`bg-slate-900/90 border ${completedSteps.build ? "border-emerald-500/40 bg-emerald-950/10" : "border-slate-800"} rounded-2xl p-6 transition-all space-y-4`}>
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <button 
              onClick={() => toggleStep("build")}
              className="mt-0.5 text-slate-400 hover:text-white transition-colors"
            >
              {completedSteps.build ? (
                <CheckSquare className="h-6 w-6 text-emerald-400" />
              ) : (
                <Square className="h-6 w-6 text-slate-600 hover:text-slate-400" />
              )}
            </button>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold uppercase tracking-wider text-blue-400">Step 5</span>
                <span className="text-xs px-2 py-0.5 rounded bg-slate-800 text-slate-300 font-mono">Compilation</span>
              </div>
              <h3 className="text-lg font-bold text-white mt-0.5">Build Signed Release APK / App Bundle (AAB)</h3>
            </div>
          </div>
          
          <span className="hidden sm:inline-flex px-3 py-1 rounded-full bg-slate-800 text-slate-300 text-xs font-medium border border-slate-700">
            Gradle CLI / Studio GUI
          </span>
        </div>

        <div className="pl-9 space-y-4 text-xs text-slate-300">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            
            {/* Option A: Terminal CLI */}
            <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-2">
              <div className="flex justify-between items-center">
                <h4 className="font-bold text-white flex items-center gap-2">
                  <Terminal className="h-4 w-4 text-blue-400" /> Option A: Command Line Build
                </h4>
                <button
                  onClick={() => copyToClipboard(BUILD_CLI_COMMANDS, "build_cli")}
                  className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 text-[10px] font-mono flex items-center gap-1 border border-slate-700"
                >
                  {copiedSnippet === "build_cli" ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
                  {copiedSnippet === "build_cli" ? "Copied!" : "Copy CLI"}
                </button>
              </div>
              <pre className="p-3 bg-slate-900 border border-slate-800 rounded-lg font-mono text-[10px] text-emerald-400 overflow-x-auto select-text">
                <code>{BUILD_CLI_COMMANDS}</code>
              </pre>
              <p className="text-[10px] text-slate-400">
                Generated APK path: <br />
                <code className="text-slate-200 font-mono">android/app/build/outputs/apk/release/app-release.apk</code>
              </p>
            </div>

            {/* Option B: Android Studio GUI */}
            <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-2">
              <h4 className="font-bold text-white flex items-center gap-2">
                <Wrench className="h-4 w-4 text-emerald-400" /> Option B: Android Studio GUI
              </h4>
              <ol className="list-decimal list-inside space-y-1.5 text-slate-400 text-[11px]">
                <li>In top menu, click <strong>Build &gt; Generate Signed Bundle / APK...</strong></li>
                <li>Select <strong>Android App Bundle (.aab)</strong> for Play Store OR <strong>APK</strong> for direct device sideloading.</li>
                <li>Choose your <code className="text-slate-200 font-mono">release-key.jks</code> file and enter passwords.</li>
                <li>Select build variant <strong className="text-white">release</strong> and click <strong>Create</strong>.</li>
              </ol>
            </div>

          </div>
        </div>
      </div>

      {/* STEP 6: SIDELOADING & ACTIVATING ROLE */}
      <div className={`bg-slate-900/90 border ${completedSteps.install ? "border-emerald-500/40 bg-emerald-950/10" : "border-slate-800"} rounded-2xl p-6 transition-all space-y-4`}>
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <button 
              onClick={() => toggleStep("install")}
              className="mt-0.5 text-slate-400 hover:text-white transition-colors"
            >
              {completedSteps.install ? (
                <CheckSquare className="h-6 w-6 text-emerald-400" />
              ) : (
                <Square className="h-6 w-6 text-slate-600 hover:text-slate-400" />
              )}
            </button>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold uppercase tracking-wider text-blue-400">Step 6</span>
                <span className="text-xs px-2 py-0.5 rounded bg-slate-800 text-slate-300 font-mono">Device Verification</span>
              </div>
              <h3 className="text-lg font-bold text-white mt-0.5">Sideload APK & Activate Android Call Screening Role</h3>
            </div>
          </div>
          
          <span className="hidden sm:inline-flex px-3 py-1 rounded-full bg-slate-800 text-slate-300 text-xs font-medium border border-slate-700">
            ADB Installation
          </span>
        </div>

        <div className="pl-9 space-y-4 text-xs text-slate-300">
          <div className="space-y-1.5">
            <div className="flex justify-between items-center text-slate-400">
              <span className="font-semibold text-[11px] flex items-center gap-1.5 text-slate-300">
                <Terminal className="h-3.5 w-3.5 text-blue-400" /> Install APK via ADB
              </span>
              <button
                onClick={() => copyToClipboard(ADB_INSTALL_COMMAND, "adb")}
                className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px] font-mono flex items-center gap-1 border border-slate-700 transition-colors"
              >
                {copiedSnippet === "adb" ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
                {copiedSnippet === "adb" ? "Copied!" : "Copy Command"}
              </button>
            </div>
            <pre className="p-3 bg-slate-950 border border-slate-800 rounded-xl font-mono text-[11px] text-emerald-400 overflow-x-auto select-text">
              <code>{ADB_INSTALL_COMMAND}</code>
            </pre>
          </div>

          <div className="bg-blue-950/20 border border-blue-500/20 p-4 rounded-xl space-y-2">
            <h4 className="font-bold text-blue-300 flex items-center gap-2">
              <Shield className="h-4 w-4 text-blue-400" /> Post-Installation Role Granting
            </h4>
            <p className="text-slate-300 leading-relaxed text-[11px]">
              After opening CallGuard on your physical phone, grant the required <strong>Caller ID & Spam App Role</strong>:
            </p>
            <p className="text-slate-400 text-[11px] font-mono bg-slate-950 p-2 rounded border border-slate-800">
              Settings &gt; Apps &gt; Default Apps &gt; Caller ID & Spam app &gt; Select "CallGuard Screener"
            </p>
            <p className="text-[10px] text-slate-400">
              Once granted, Android Telecom will route every incoming call through your app's background service without needing any cloud server or background daemon process!
            </p>
          </div>
        </div>
      </div>

      {/* FOOTER CALLOUT */}
      <div className="p-6 bg-slate-900 border border-slate-800 rounded-2xl flex flex-col sm:flex-row items-center justify-between gap-4 text-center sm:text-left">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 bg-blue-600/20 border border-blue-500/30 rounded-xl flex items-center justify-center shrink-0">
            <Sparkles className="h-5 w-5 text-blue-400" />
          </div>
          <div>
            <h4 className="text-sm font-bold text-white">Ready to Deploy to Google Play?</h4>
            <p className="text-xs text-slate-400">Your app uses 100% standard Android APIs with zero forbidden permissions.</p>
          </div>
        </div>

        {onBackToApp && (
          <button
            onClick={onBackToApp}
            className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs transition-colors shadow-lg shadow-blue-500/10 cursor-pointer shrink-0"
          >
            Launch Interactive Simulator
          </button>
        )}
      </div>

    </div>
  );
};
